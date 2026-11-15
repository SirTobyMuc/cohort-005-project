import { describe, it, expect, vi, afterEach } from "vitest";
import {
  defaultNotifications,
  fakeNotifications,
  sendNotification,
  type NotificationTrigger,
} from "./notifications.server";

afterEach(() => {
  vi.restoreAllMocks();
});

const confirmation: NotificationTrigger = {
  kind: "refund_request_confirmation",
  recipients: [{ id: 1, name: "Ana", email: "ana@example.com", avatar: null }],
  sender: null,
  data: {
    refundRequestId: 7,
    courseTitle: "Test Course",
    amount: 7900,
    url: null,
  },
  idempotencyKey: "refund-requested:7",
};

describe("defaultNotifications", () => {
  it("only logs when there is no Knock secret key", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    const notifications = defaultNotifications({});
    await notifications.trigger(confirmation);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("refund_request_confirmation")
    );
  });
});

describe("sendNotification", () => {
  it("logs a failed trigger instead of throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      async trigger() {
        throw new Error("Knock is down");
      },
    };

    await expect(
      sendNotification(broken, confirmation)
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});

describe("preferences", () => {
  const ana = { id: 1, name: "Ana", email: "ana@example.com", avatar: null };

  it("setting one switch leaves the other categories unchanged", async () => {
    const notifications = fakeNotifications();
    await notifications.syncUser(ana);
    await notifications.setPreference(ana.id, "discussion_replies", "feed", false);

    await notifications.setPreference(ana.id, "enrollments", "feed", true);

    expect(await notifications.getPreferences(ana.id)).toEqual({
      refund_request_updates: { feed: true },
      open_refund_requests: { feed: true },
      seat_claims: { feed: true },
      enrollments: { feed: true },
      discussion_questions: { feed: true },
      discussion_replies: { feed: false },
    });
  });

  it("syncing again never overwrites existing choices", async () => {
    const notifications = fakeNotifications();
    await notifications.syncUser(ana);
    await notifications.setPreference(ana.id, "seat_claims", "feed", false);

    await notifications.syncUser({ ...ana, name: "Ana Lima" });

    expect((await notifications.getPreferences(ana.id)).seat_claims).toEqual({
      feed: false,
    });
  });

  it("the no-op adapter reports the defaults without Knock", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const notifications = defaultNotifications({});
    await notifications.syncUser(ana);

    expect(await notifications.getPreferences(ana.id)).toMatchObject({
      enrollments: { feed: false },
      discussion_questions: { feed: true },
    });
  });
});
