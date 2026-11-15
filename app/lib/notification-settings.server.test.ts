import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { buyTeamLicence, createPurchase } from "./purchases.server";
import { visibleNotificationCategories } from "./notification-settings.server";

const NOW = new Date("2026-03-01T12:00:00Z");

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

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
});
