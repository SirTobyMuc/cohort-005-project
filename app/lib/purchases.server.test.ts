import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { buyTeamLicence } from "./purchases.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

describe("buyTeamLicence", () => {
  it("grants Seats but no Enrollment to the Team Admin", () => {
    const { purchase, team, seats } = buyTeamLicence(
      db,
      base.user.id,
      base.course.id,
      3 * 7900,
      "US",
      3,
      NOW
    );

    expect(purchase).toMatchObject({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 23700,
      country: "US",
      createdAt: NOW.toISOString(),
    });
    expect(seats).toHaveLength(3);
    expect(new Set(seats.map((s) => s.code)).size).toBe(3);
    expect(seats.every((s) => s.teamId === team.id)).toBe(true);
    expect(seats.every((s) => s.redeemedByUserId === null)).toBe(true);

    const membership = db.select().from(schema.teamMembers).all();
    expect(membership).toMatchObject([
      { teamId: team.id, userId: base.user.id, role: "admin" },
    ]);

    expect(db.select().from(schema.enrollments).all()).toEqual([]);
  });

  it("reuses the Team Admin's team for a second Team Licence", () => {
    const first = buyTeamLicence(db, base.user.id, base.course.id, 7900, null, 1, NOW);
    const second = buyTeamLicence(db, base.user.id, base.course.id, 7900, null, 1, NOW);

    expect(second.team.id).toBe(first.team.id);
    expect(db.select().from(schema.teams).all()).toHaveLength(1);
  });
});
