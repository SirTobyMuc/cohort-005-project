import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { buyTeamLicence, createPurchase } from "./purchases.server";
import { fakeNotifications } from "./notifications.server";
import {
  saveNotificationPreference,
  visibleNotificationCategories,
} from "./notification-settings.server";

const NOW = new Date("2026-03-01T12:00:00Z");

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function addUser(name: string, role: schema.UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

describe("visibleNotificationCategories", () => {
  it("shows only Discussion Replies to a Student with nothing", () => {
    expect(visibleNotificationCategories(db, base.user.id)).toEqual([
      "discussion_replies",
    ]);
  });

  it("adds Refund Request updates once they have a Purchase", () => {
    createPurchase(db, base.user.id, base.course.id, 5000, "US", NOW);

    expect(visibleNotificationCategories(db, base.user.id)).toEqual([
      "refund_request_updates",
      "discussion_replies",
    ]);
  });

  it("adds Seat claims for a Team Admin on a Team Licence", () => {
    buyTeamLicence(db, base.user.id, base.course.id, 20000, "US", 3, NOW);

    expect(visibleNotificationCategories(db, base.user.id)).toEqual([
      "refund_request_updates",
      "seat_claims",
      "discussion_replies",
    ]);
  });

  it("doesn't add Seat claims for a team member who isn't its Team Admin", () => {
    const { team } = buyTeamLicence(
      db,
      base.user.id,
      base.course.id,
      20000,
      "US",
      3,
      NOW
    );
    const member = db
      .insert(schema.users)
      .values({
        name: "Member",
        email: "member@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    db.insert(schema.teamMembers)
      .values({
        teamId: team.id,
        userId: member.id,
        role: schema.TeamMemberRole.Member,
      })
      .run();

    expect(visibleNotificationCategories(db, member.id)).toEqual([
      "discussion_replies",
    ]);
  });

  it("adds Seat claims only for the Team Licence's buyer, not another team admin", () => {
    const { team } = buyTeamLicence(
      db,
      base.user.id,
      base.course.id,
      20000,
      "US",
      3,
      NOW
    );
    const coAdmin = addUser("Co-admin", schema.UserRole.Student);
    db.insert(schema.teamMembers)
      .values({
        teamId: team.id,
        userId: coAdmin.id,
        role: schema.TeamMemberRole.Admin,
      })
      .run();

    expect(visibleNotificationCategories(db, coAdmin.id)).toEqual([
      "discussion_replies",
    ]);
  });

  it("adds Enrollments and Discussion Questions for whoever instructs a course, whatever their role", () => {
    const owner = addUser("Owner", schema.UserRole.Student);
    db.update(schema.courses)
      .set({ instructorId: owner.id })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    expect(visibleNotificationCategories(db, owner.id)).toEqual([
      "enrollments",
      "discussion_questions",
      "discussion_replies",
    ]);
  });

  it("doesn't add them for an Instructor role with no course", () => {
    const newInstructor = addUser("New", schema.UserRole.Instructor);

    expect(visibleNotificationCategories(db, newInstructor.id)).toEqual([
      "discussion_replies",
    ]);
  });

  it("adds Enrollments and Discussion Questions for an Instructor", () => {
    expect(visibleNotificationCategories(db, base.instructor.id)).toEqual([
      "enrollments",
      "discussion_questions",
      "discussion_replies",
    ]);
  });

  it("adds Open Refund Requests for a Platform Admin", () => {
    const admin = db
      .insert(schema.users)
      .values({
        name: "Admin",
        email: "admin@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();

    expect(visibleNotificationCategories(db, admin.id)).toEqual([
      "open_refund_requests",
      "discussion_replies",
    ]);
  });
});

describe("saveNotificationPreference", () => {
  function form(fields: Record<string, string>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value);
    }
    return formData;
  }

  it("flips one category's feed switch and leaves every other one alone", async () => {
    const notifications = fakeNotifications();

    const result = await saveNotificationPreference(
      notifications,
      base.user.id,
      form({ category: "discussion_replies", enabled: "false" })
    );

    expect(result).toEqual({ ok: true });
    expect(await notifications.getPreferences(base.user.id)).toEqual({
      refund_request_updates: { feed: true },
      open_refund_requests: { feed: true },
      seat_claims: { feed: true },
      enrollments: { feed: false },
      discussion_questions: { feed: true },
      discussion_replies: { feed: false },
    });
  });

  it("rejects an unknown category without saving anything", async () => {
    const notifications = fakeNotifications();

    const result = await saveNotificationPreference(
      notifications,
      base.user.id,
      form({ category: "marketing", enabled: "false" })
    );

    expect(result.ok).toBe(false);
    expect(await notifications.getPreferences(base.user.id)).toEqual(
      await fakeNotifications().getPreferences(base.user.id)
    );
  });

  it("reports a failed save instead of throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = {
      ...fakeNotifications(),
      async setPreference() {
        throw new Error("down");
      },
    };

    const result = await saveNotificationPreference(
      failing,
      base.user.id,
      form({ category: "discussion_replies", enabled: "false" })
    );

    expect(result).toEqual({
      ok: false,
      error: "Couldn't save your notification settings. Try again.",
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
