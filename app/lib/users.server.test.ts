import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb } from "~/test/setup";
import { fakeNotifications } from "./notifications.server";
import { adminUpdateUser, signUp, updateProfile } from "./users.server";

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

  it("logs an existing email in without creating or syncing anyone", async () => {
    const first = await signUp(
      db,
      { name: "Ana", email: "ana@example.com" },
      notifications
    );

    const again = await signUp(
      db,
      { name: "Someone Else", email: "ana@example.com" },
      notifications
    );

    expect(again).toEqual({ user: first.user, created: false });
    expect(notifications.syncs).toHaveLength(1);
  });
});

describe("updateProfile", () => {
  it("syncs the new name, keeping the user's existing preferences", async () => {
    const { user } = await signUp(
      db,
      { name: "Ana", email: "ana@example.com" },
      notifications
    );
    await notifications.setPreference(user.id, "enrollments", "feed", true);

    await updateProfile(
      db,
      user.id,
      { name: "Ana Lima", bio: "Hi" },
      notifications
    );

    expect(notifications.syncs.at(-1)).toEqual({
      id: user.id,
      name: "Ana Lima",
      email: "ana@example.com",
      avatar: null,
    });
    expect(await notifications.getPreferences(user.id)).toEqual({
      ...DEFAULTS,
      enrollments: { feed: true },
    });
  });

  it("doesn't sync when only the bio changes", async () => {
    const { user } = await signUp(
      db,
      { name: "Ana", email: "ana@example.com" },
      notifications
    );

    const updated = await updateProfile(
      db,
      user.id,
      { name: "Ana", bio: "New bio" },
      notifications
    );

    expect(updated.bio).toBe("New bio");
    expect(notifications.syncs).toHaveLength(1);
  });
});

describe("adminUpdateUser", () => {
  it("syncs the edited name and email", async () => {
    const { user } = await signUp(
      db,
      { name: "Ana", email: "ana@example.com" },
      notifications
    );

    await adminUpdateUser(
      db,
      user.id,
      { name: "Ana Lima", email: "ana.lima@example.com" },
      notifications
    );

    expect(notifications.syncs.at(-1)).toEqual({
      id: user.id,
      name: "Ana Lima",
      email: "ana.lima@example.com",
      avatar: null,
    });
    expect(await notifications.getPreferences(user.id)).toEqual(DEFAULTS);
  });
});

describe("when the Notifications vendor is down", () => {
  const broken = {
    ...fakeNotifications(),
    async syncUser() {
      throw new Error("Knock is down");
    },
  };

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still signs up, saves the profile and saves the admin edit", async () => {
    const { user, created } = await signUp(
      db,
      { name: "Ana", email: "ana@example.com" },
      broken
    );
    expect(created).toBe(true);

    const saved = await updateProfile(
      db,
      user.id,
      { name: "Ana Lima", bio: null },
      broken
    );
    expect(saved.name).toBe("Ana Lima");

    const edited = await adminUpdateUser(
      db,
      user.id,
      { name: "Ana L.", email: "ana.l@example.com" },
      broken
    );
    expect(edited).toMatchObject({ name: "Ana L.", email: "ana.l@example.com" });

    expect(console.error).toHaveBeenCalledTimes(3);
  });
});
