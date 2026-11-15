import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "~/test/setup";
import { fakeNotifications } from "./notifications.server";
import { signUp } from "./users.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let notifications: ReturnType<typeof fakeNotifications>;

beforeEach(() => {
  db = createTestDb();
  notifications = fakeNotifications();
});

const DEFAULTS = {
  refund_request_updates: { feed: true },
  open_refund_requests: { feed: true },
  seat_claims: { feed: true },
  enrollments: { feed: false },
  discussion_questions: { feed: true },
  discussion_replies: { feed: true },
};

describe("signUp", () => {
  it("syncs the new user with default preferences, Enrollments off", async () => {
    const { user } = await signUp(
      db,
      { name: "Ana", email: "ana@example.com" },
      notifications
    );

    expect(notifications.syncs).toEqual([
      { id: user.id, name: "Ana", email: "ana@example.com", avatar: null },
    ]);
    expect(await notifications.getPreferences(user.id)).toEqual(DEFAULTS);
  });
});
