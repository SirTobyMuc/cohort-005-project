import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  defaultNotifications,
  notificationFeedConfig,
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

describe("notificationFeedConfig", () => {
  it("gives no feed when Knock's client keys are missing", async () => {
    expect(await notificationFeedConfig(42, {})).toBeNull();
  });

  it("signs an RS256 token for that user only", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    const config = await notificationFeedConfig(42, {
      KNOCK_PUBLIC_API_KEY: "pk_test_123",
      KNOCK_SIGNING_KEY: privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
      KNOCK_FEED_CHANNEL_ID: "feed-channel",
    });

    expect(config).toMatchObject({
      publicApiKey: "pk_test_123",
      feedChannelId: "feed-channel",
      userId: "42",
    });
    const [header, payload, signature] = (config?.userToken ?? "").split(".");
    const decode = (part: string) =>
      JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    expect(decode(header).alg).toBe("RS256");
    expect(decode(payload).sub).toBe("42");
    expect(
      createVerify("RSA-SHA256")
        .update(`${header}.${payload}`)
        .verify(publicKey, signature, "base64url")
    ).toBe(true);
  });
});
