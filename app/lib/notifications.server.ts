import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import Knock, { signUserToken } from "@knocklabs/node";

// ─── Notifications ───
// The Cadence-owned port for sending Notifications (see GLOSSARY.md and #46).
// Domain services take it as a parameter, like `db` and `now`, and fire
// Notifications through it after their write commits.
//
// Three adapters, picked like the MailTransport in mailer.server.ts:
// - knockNotifications: the real one. Only it knows Knock's workflow keys.
// - fakeNotifications: records triggers in memory, for vitest.
// - noopNotifications: logs only, for when KNOCK_SECRET_API_KEY is missing.

/** Someone a Notification is sent to, or who caused it. */
export type NotificationUser = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
};

/**
 * One Notification and what its feed row needs. Cadence writes the row's text
 * from `data`; `url` is where clicking the row goes, or null for nowhere.
 */
export type Notification =
  // 8: to the buyer, confirming their Refund Request is under review.
  | {
      kind: "refund_request_confirmation";
      data: {
        refundRequestId: number;
        courseTitle: string;
        amount: number;
        url: null;
      };
    }
  // 3: to every Platform Admin, when a buyer raises a Refund Request.
  | {
      kind: "open_refund_request";
      data: {
        refundRequestId: number;
        courseTitle: string;
        amount: number;
        reason: string;
        url: string;
      };
    }
  // 1: to the buyer, when a Platform Admin approves their Refund Request.
  | {
      kind: "refund_request_approved";
      data: {
        refundRequestId: number;
        purchaseId: number;
        purchasedAt: string;
        courseTitle: string;
        amount: number;
        decisionNote: string | null;
        url: null;
      };
    }
  // 2: to the buyer, when a Platform Admin declines their Refund Request.
  // The row reminds them they can raise a new one.
  | {
      kind: "refund_request_declined";
      data: {
        refundRequestId: number;
        purchaseId: number;
        courseTitle: string;
        amount: number;
        decisionNote: string;
        url: null;
      };
    };

export type NotificationKind = Notification["kind"];

export type NotificationTrigger = Notification & {
  recipients: NotificationUser[];
  /** Who caused it. Null for Notifications from Cadence itself. */
  sender: NotificationUser | null;
  /** Stable per domain event, e.g. `refund-requested:<id>`. */
  idempotencyKey: string;
};

export interface Notifications {
  trigger(notification: NotificationTrigger): Promise<void>;
}

export function toNotificationUser(user: {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
}): NotificationUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatarUrl,
  };
}

/**
 * Fires one Notification, best-effort: a failure is logged and swallowed, so a
 * vendor outage never fails the domain action that caused it. No retries.
 */
export async function sendNotification(
  notifications: Notifications,
  notification: NotificationTrigger
): Promise<void> {
  try {
    await notifications.trigger(notification);
  } catch (error) {
    console.error(
      `Notification ${notification.kind} (${notification.idempotencyKey}) failed:`,
      error
    );
  }
}

// ─── Adapters ───

// Only this adapter knows Knock's keys. Each Notification is one workflow,
// and the workflow carries its preference category (see knock/workflows on
// the knock-workflows branch).
const KNOCK_WORKFLOW_KEYS: Record<NotificationKind, string> = {
  refund_request_confirmation: "refund-request-confirmation",
  open_refund_request: "open-refund-request",
  refund_request_approved: "refund-request-approved",
  refund_request_declined: "refund-request-declined",
};

function toKnockUser(user: NotificationUser) {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    ...(user.avatar ? { avatar: user.avatar } : {}),
  };
}

export function knockNotifications(secretApiKey: string): Notifications {
  const knock = new Knock({ apiKey: secretApiKey });
  return {
    async trigger(notification) {
      const workflowKey = KNOCK_WORKFLOW_KEYS[notification.kind];
      await knock.workflows.trigger(
        workflowKey,
        {
          recipients: notification.recipients.map(toKnockUser),
          actor: notification.sender ? toKnockUser(notification.sender) : null,
          data: notification.data,
        },
        // One domain event can fire several workflows (raising a Refund
        // Request fires two), so scope the key to the workflow.
        { idempotencyKey: `${workflowKey}:${notification.idempotencyKey}` }
      );
    },
  };
}

/** Logs instead of sending, for running without Knock (local dev, CI). */
export function noopNotifications(): Notifications {
  return {
    async trigger(notification) {
      console.info(
        `[notifications] ${notification.kind} to ${notification.recipients
          .map((r) => r.id)
          .join(
            ", "
          )} (${notification.idempotencyKey}) not sent: no KNOCK_SECRET_API_KEY`
      );
    },
  };
}

type KnockEnv = { KNOCK_SECRET_API_KEY?: string };

// Vite doesn't put values without a VITE_ prefix on process.env, so read
// .env ourselves. Parsed rather than loaded, so process.env stays untouched.
function readKnockEnv(): KnockEnv {
  if (process.env.KNOCK_SECRET_API_KEY) return process.env;
  if (!existsSync(".env")) return {};
  return parseEnv(readFileSync(".env", "utf8"));
}

/** Knock when a secret key is set, otherwise the no-op adapter. */
export function defaultNotifications(
  env: KnockEnv = readKnockEnv()
): Notifications {
  const secretApiKey = env.KNOCK_SECRET_API_KEY;
  return secretApiKey ? knockNotifications(secretApiKey) : noopNotifications();
}

// ─── Notification Feed ───
// The browser reads its Notification Feed straight from the vendor, with a
// token signed here for the session user only (enhanced security: a token for
// one user can't read another user's feed). See app/lib/notification-feed.ts.

/** What the client adapter needs to open one person's Notification Feed. */
export type NotificationFeedConfig = {
  publicApiKey: string;
  feedChannelId: string;
  userId: string;
  userToken: string;
};

type KnockFeedEnv = {
  KNOCK_PUBLIC_API_KEY?: string;
  KNOCK_SIGNING_KEY?: string;
  KNOCK_FEED_CHANNEL_ID?: string;
};

function readKnockFeedEnv(): KnockFeedEnv {
  if (process.env.KNOCK_SIGNING_KEY) return process.env;
  if (!existsSync(".env")) return {};
  return parseEnv(readFileSync(".env", "utf8"));
}

/**
 * Signs a user token (RS256, `sub` = the Cadence user id) and returns the feed
 * config for that user, or null without Knock's client keys: the feed is then
 * empty and nothing errors.
 */
export async function notificationFeedConfig(
  cadenceUserId: number,
  env: KnockFeedEnv = readKnockFeedEnv()
): Promise<NotificationFeedConfig | null> {
  const { KNOCK_PUBLIC_API_KEY, KNOCK_SIGNING_KEY, KNOCK_FEED_CHANNEL_ID } =
    env;
  if (!KNOCK_PUBLIC_API_KEY || !KNOCK_SIGNING_KEY || !KNOCK_FEED_CHANNEL_ID) {
    return null;
  }
  const userId = String(cadenceUserId);
  return {
    publicApiKey: KNOCK_PUBLIC_API_KEY,
    feedChannelId: KNOCK_FEED_CHANNEL_ID,
    userId,
    userToken: await signUserToken(userId, {
      signingKey: KNOCK_SIGNING_KEY,
      expiresInSeconds: 60 * 60,
    }),
  };
}

/** Records every trigger, for tests to check what was sent. */
export function fakeNotifications(): Notifications & {
  triggers: NotificationTrigger[];
} {
  const triggers: NotificationTrigger[] = [];
  return {
    triggers,
    async trigger(notification) {
      triggers.push(notification);
    },
  };
}
