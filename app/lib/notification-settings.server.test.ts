import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { createPurchase } from "./purchases.server";
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
});
