import { describe, it, expect, vi, afterEach } from "vitest";
import {
  defaultNotifications,
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
