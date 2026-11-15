import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { buyTeamLicence } from "./purchases.server";
import { enrollUser } from "./enrollments.server";
import { redeemCoupon } from "./seats.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let student: typeof schema.users.$inferSelect;

beforeEach(() => {
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

describe("redeemCoupon", () => {
  it("claims the Seat and enrolls the Student", () => {
    const { seats } = buyLicence();

    const result = redeemCoupon(db, seats[0].code, student.id, "US", NOW);

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

  it("refuses a Seat that is already claimed", () => {
    const { seats } = buyLicence();
    redeemCoupon(db, seats[0].code, student.id, "US", NOW);

    expect(redeemCoupon(db, seats[0].code, base.user.id, "US", NOW)).toEqual({
      ok: false,
      error: "Coupon has already been redeemed",
    });
  });

  it("refuses a Student who is already enrolled, leaving the Seat unclaimed", () => {
    const { seats } = buyLicence();
    enrollUser(db, student.id, base.course.id, NOW);

    expect(redeemCoupon(db, seats[0].code, student.id, "US", NOW)).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
    const seat = db.select().from(schema.coupons).all()[0];
    expect(seat.redeemedByUserId).toBeNull();
  });

  it("refuses a claim from another country than the purchaser's", () => {
    const { seats } = buyLicence("US");

    expect(
      redeemCoupon(db, seats[0].code, student.id, "IN", NOW)
    ).toMatchObject({
      ok: false,
    });
    expect(db.select().from(schema.enrollments).all()).toEqual([]);
  });

  it("refuses an unknown code", () => {
    expect(redeemCoupon(db, "nope", student.id, "US", NOW)).toEqual({
      ok: false,
      error: "Coupon not found",
    });
  });
});
