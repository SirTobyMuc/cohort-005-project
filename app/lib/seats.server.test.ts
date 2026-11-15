import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { buyTeamLicence } from "./purchases.server";
import { enrollUser } from "./enrollments.server";
import { redeemCoupon } from "./seats.server";
import { fakeNotifications } from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let student: typeof schema.users.$inferSelect;
let notifications: ReturnType<typeof fakeNotifications>;

beforeEach(() => {
  notifications = fakeNotifications();
  db = createTestDb();
  base = seedBaseData(db);
  student = db
    .insert(schema.users)
    .values({ name: "Sam", email: "sam@example.com", role: UserRole.Student })
    .returning()
    .get();
});

function buyLicence(country: string | null = "US") {
  return buyTeamLicence(
    db,
    base.user.id,
    base.course.id,
    7900,
    country,
    2,
    NOW
  );
}

function claim(code: string, userId: number, country = "US") {
  return redeemCoupon(db, code, userId, country, NOW, notifications);
}

describe("redeemCoupon", () => {
  it("claims the Seat and enrolls the Student", async () => {
    const { seats } = buyLicence();

    const result = await claim(seats[0].code, student.id, "US");

    expect(result).toMatchObject({
      ok: true,
      enrollment: {
        userId: student.id,
        courseId: base.course.id,
        enrolledAt: NOW.toISOString(),
      },
    });
    const seat = db
      .select()
      .from(schema.coupons)
      .all()
      .find((s) => s.id === seats[0].id);
    expect(seat).toMatchObject({
      redeemedByUserId: student.id,
      redeemedAt: NOW.toISOString(),
    });
    expect(db.select().from(schema.enrollments).all()).toHaveLength(1);
  });

  it("refuses a Seat that is already claimed", async () => {
    const { seats } = buyLicence();
    await claim(seats[0].code, student.id, "US");

    expect(await claim(seats[0].code, base.user.id, "US")).toEqual({
      ok: false,
      error: "Coupon has already been redeemed",
    });
  });

  it("refuses a Student who is already enrolled, leaving the Seat unclaimed", async () => {
    const { seats } = buyLicence();
    await enrollUser(db, student.id, base.course.id, NOW, notifications);

    expect(await claim(seats[0].code, student.id, "US")).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
    const seat = db.select().from(schema.coupons).all()[0];
    expect(seat.redeemedByUserId).toBeNull();
  });

  it("refuses a claim from another country than the purchaser's", async () => {
    const { seats } = buyLicence("US");

    expect(await claim(seats[0].code, student.id, "IN")).toMatchObject({
      ok: false,
    });
    expect(db.select().from(schema.enrollments).all()).toEqual([]);
  });

  it("refuses an unknown code", async () => {
    expect(await claim("nope", student.id, "US")).toEqual({
      ok: false,
      error: "Coupon not found",
    });
  });
});

describe("Seat claimed Notification", () => {
  const teamAdmin = {
    name: "Test User",
    email: "test@example.com",
    avatar: null,
  };
  const sam = { name: "Sam", email: "sam@example.com", avatar: null };

  it("tells the Team Admin a Seat was claimed, from the Student, with the Seats left", async () => {
    const { seats } = buyLicence();

    await claim(seats[0].code, student.id);

    expect(
      notifications.triggers.filter((t) => t.kind === "seat_claimed")
    ).toEqual([
      {
        kind: "seat_claimed",
        recipients: [{ id: base.user.id, ...teamAdmin }],
        sender: { id: student.id, ...sam },
        data: {
          seatId: seats[0].id,
          courseTitle: "Test Course",
          seatsLeft: 1,
          url: "/team",
        },
        idempotencyKey: `seat-claimed:${seats[0].id}`,
      },
    ]);
  });

  it("counts down the Seats left on that Team Licence only", async () => {
    const { seats } = buyLicence();
    buyLicence();
    const ben = db
      .insert(schema.users)
      .values({ name: "Ben", email: "ben@example.com", role: UserRole.Student })
      .returning()
      .get();
    await claim(seats[0].code, student.id);

    await claim(seats[1].code, ben.id);

    expect(
      notifications.triggers
        .filter((t) => t.kind === "seat_claimed")
        .map((t) => (t.data as { seatsLeft: number }).seatsLeft)
    ).toEqual([1, 0]);
  });

  it("also tells the Instructor about the new Enrollment", async () => {
    const { seats } = buyLicence();

    const result = await claim(seats[0].code, student.id);

    expect(
      notifications.triggers.filter((t) => t.kind === "new_enrollment")
    ).toMatchObject([
      {
        recipients: [{ id: base.instructor.id }],
        sender: { id: student.id },
        idempotencyKey: `enrollment:${result.ok && result.enrollment.id}`,
      },
    ]);
  });

  it("sends nothing for a refused claim", async () => {
    const { seats } = buyLicence("US");

    await claim(seats[0].code, student.id, "IN");

    expect(notifications.triggers).toEqual([]);
  });

  it("still claims the Seat when the Notifications fail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { seats } = buyLicence();

    const result = await redeemCoupon(
      db,
      seats[0].code,
      student.id,
      "US",
      NOW,
      {
        async trigger() {
          throw new Error("down");
        },
      }
    );

    expect(result).toMatchObject({ ok: true });
    expect(db.select().from(schema.enrollments).all()).toHaveLength(1);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
