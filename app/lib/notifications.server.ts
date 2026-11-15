import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import Knock, { NotFoundError, signUserToken } from "@knocklabs/node";
import { KNOCK_WORKFLOW_KEYS } from "~/lib/knock-workflows";
import type { Notification } from "~/lib/notification-kinds";

// ─── Notifications ───
// The Cadence-owned port for sending Notifications (see GLOSSARY.md and #46).
// Domain services take it as a parameter, like `db` and `now`, and fire
// Notifications through it after their write commits.
//
// Three adapters, picked like the MailTransport in mailer.server.ts:
// - knockNotifications: the real one. It and the feed's Knock adapter take
//   Knock's workflow keys from knock-workflows.ts.
// - fakeNotifications: records triggers in memory, for vitest.
// - noopNotifications: logs only, for when KNOCK_SECRET_API_KEY is missing.

/** Someone a Notification is sent to, or who caused it. */
export type NotificationUser = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
};

export type {
  DiscussionNotificationData,
  Notification,
  NotificationKind,
} from "~/lib/notification-kinds";

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

/**
 * Keeps the vendor's copy of a user and their preferences. Separate from
 * `Notifications` so trigger-only adapters still fit where only triggering is
 * needed.
 */
export interface NotificationUsers {
  /**
   * Creates or updates the user, and writes the default preferences only if
   * they have none yet. Existing choices are never overwritten.
   */
  syncUser(user: NotificationUser): Promise<void>;
  /** The user's preferences, or the defaults if they have none yet. */
  getPreferences(userId: number): Promise<NotificationPreferences>;
  /** Sets one category × channel switch, leaving the others alone. */
  setPreference(
    userId: number,
    category: NotificationCategory,
    channel: NotificationChannel,
    enabled: boolean
  ): Promise<void>;
}

// ─── Preferences ───
// Modelled as category × channel. Only the adapters know Knock's keys.

export const NOTIFICATION_CATEGORIES = [
  "refund_request_updates",
  "open_refund_requests",
  "seat_claims",
  "enrollments",
  "discussion_questions",
  "discussion_replies",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** The only channel in v1 is the in-app feed. */
export const NOTIFICATION_CHANNELS = ["feed"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationPreferences = Record<
  NotificationCategory,
  Record<NotificationChannel, boolean>
>;

/** Every category on, except Enrollments. */
export function defaultPreferences(): NotificationPreferences {
  return {
    refund_request_updates: { feed: true },
    open_refund_requests: { feed: true },
    seat_claims: { feed: true },
    enrollments: { feed: false },
    discussion_questions: { feed: true },
    discussion_replies: { feed: true },
  };
}

function withPreference(
  preferences: NotificationPreferences,
  category: NotificationCategory,
  channel: NotificationChannel,
  enabled: boolean
): NotificationPreferences {
  return {
    ...preferences,
    [category]: { ...preferences[category], [channel]: enabled },
  };
}

/** The domain event that caused Notifications, for archiving them all. */
export type NotificationCause = { commentId: number };

/**
 * Takes Notifications back out of their recipients' feeds once what caused
 * them is gone. Separate from `Notifications` so trigger-only adapters still
 * fit where only triggering is needed.
 */
export interface NotificationArchive {
  /** Archives every Notification whose `data` matches the cause. */
  archive(cause: NotificationCause): Promise<void>;
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

/**
 * Syncs one user, best-effort like sendNotification: a failure is logged and
 * swallowed, so it never fails signup, a profile save or an admin edit.
 */
export async function syncNotificationUser(
  notifications: NotificationUsers,
  user: NotificationUser
): Promise<void> {
  try {
    await notifications.syncUser(user);
  } catch (error) {
    console.error(`Notification user sync for user ${user.id} failed:`, error);
  }
}

/** Archives a cause's Notifications, best-effort like `sendNotification`. */
export async function archiveNotifications(
  archive: NotificationArchive,
  cause: NotificationCause
): Promise<void> {
  try {
    await archive.archive(cause);
  } catch (error) {
    console.error(
      `Archiving Notifications for ${JSON.stringify(cause)} failed:`,
      error
    );
  }
}

// ─── Adapters ───

function toKnockUser(user: NotificationUser) {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    ...(user.avatar ? { avatar: user.avatar } : {}),
  };
}

// Cadence's category names are Knock's category keys (see the workflows on
// the knock-workflows branch). Cadence's `feed` channel is Knock's in-app feed.
const KNOCK_CHANNEL_TYPES: Record<NotificationChannel, "in_app_feed"> = {
  feed: "in_app_feed",
};
const KNOCK_PREFERENCE_SET = "default";

type KnockCategorySetting =
  boolean | { channel_types?: Partial<Record<string, unknown>> | null };
type KnockCategories = Record<string, KnockCategorySetting>;

function fromKnockCategories(
  categories: KnockCategories
): NotificationPreferences {
  let preferences = defaultPreferences();
  for (const category of NOTIFICATION_CATEGORIES) {
    const setting = categories[category];
    if (setting === undefined) continue;
    for (const channel of NOTIFICATION_CHANNELS) {
      const value =
        typeof setting === "boolean"
          ? setting
          : setting.channel_types?.[KNOCK_CHANNEL_TYPES[channel]];
      if (typeof value === "boolean") {
        preferences = withPreference(preferences, category, channel, value);
      }
    }
  }
  return preferences;
}

function toKnockCategories(preferences: NotificationPreferences) {
  return Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((category) => [
      category,
      {
        channel_types: Object.fromEntries(
          NOTIFICATION_CHANNELS.map((channel) => [
            KNOCK_CHANNEL_TYPES[channel],
            preferences[category][channel],
          ])
        ),
      },
    ])
  );
}

// Knock's batch endpoints take at most 50 message ids.
const KNOCK_BATCH_SIZE = 50;

export function knockNotifications(
  secretApiKey: string
): Notifications & NotificationArchive & NotificationUsers {
  const knock = new Knock({ apiKey: secretApiKey });

  /** The user's own Knock categories, or null if they have none yet. */
  async function readCategories(userId: number) {
    try {
      const set = await knock.users.getPreferences(
        String(userId),
        KNOCK_PREFERENCE_SET
      );
      const categories = (set.categories ?? {}) as KnockCategories;
      return Object.keys(categories).length > 0 ? categories : null;
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  return {
    // Every Notification's trigger data carries its cause (e.g. `commentId`),
    // so List Messages' `trigger_data` filter finds what to archive. No
    // mapping of causes to message ids is kept on our side.
    async archive(cause) {
      const messageIds: string[] = [];
      for await (const message of knock.messages.list({
        trigger_data: JSON.stringify(cause),
      })) {
        if (!message.archived_at) messageIds.push(message.id);
      }
      for (let i = 0; i < messageIds.length; i += KNOCK_BATCH_SIZE) {
        await knock.messages.batch.archive({
          message_ids: messageIds.slice(i, i + KNOCK_BATCH_SIZE),
        });
      }
    },
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
    async syncUser(user) {
      const { id, ...properties } = toKnockUser(user);
      await knock.users.update(id, properties);
      if ((await readCategories(user.id)) === null) {
        await knock.users.setPreferences(id, KNOCK_PREFERENCE_SET, {
          categories: toKnockCategories(defaultPreferences()),
        });
      }
    },
    async getPreferences(userId) {
      return fromKnockCategories((await readCategories(userId)) ?? {});
    },
    async setPreference(userId, category, channel, enabled) {
      // Knock's setPreferences replaces the whole set, so read, merge one
      // switch and write it all back. Unknown Knock categories are kept.
      const existing = (await readCategories(userId)) ?? {};
      const merged = withPreference(
        fromKnockCategories(existing),
        category,
        channel,
        enabled
      );
      await knock.users.setPreferences(String(userId), KNOCK_PREFERENCE_SET, {
        categories: { ...existing, ...toKnockCategories(merged) },
      });
    },
  };
}

/** Logs instead of sending, for running without Knock (local dev, CI). */
export function noopNotifications(): Notifications &
  NotificationArchive &
  NotificationUsers {
  return {
    async archive(cause) {
      console.info(
        `[notifications] archive ${JSON.stringify(cause)} not sent: no KNOCK_SECRET_API_KEY`
      );
    },
    async trigger(notification) {
      console.info(
        `[notifications] ${notification.kind} to ${notification.recipients
          .map((r) => r.id)
          .join(
            ", "
          )} (${notification.idempotencyKey}) not sent: no KNOCK_SECRET_API_KEY`
      );
    },
    async syncUser(user) {
      console.info(
        `[notifications] user ${user.id} not synced: no KNOCK_SECRET_API_KEY`
      );
    },
    async getPreferences() {
      return defaultPreferences();
    },
    async setPreference(userId, category, channel, enabled) {
      console.info(
        `[notifications] ${category}/${channel}=${enabled} for user ${userId} not saved: no KNOCK_SECRET_API_KEY`
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

/** Whether a Knock secret key is set, for scripts that skip work without it. */
export function isKnockConfigured(env: KnockEnv = readKnockEnv()): boolean {
  return Boolean(env.KNOCK_SECRET_API_KEY);
}

/** Knock when a secret key is set, otherwise the no-op adapter. */
export function defaultNotifications(
  env: KnockEnv = readKnockEnv()
): Notifications & NotificationArchive & NotificationUsers {
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
 * empty and nothing errors. A key that can't sign is logged, not thrown, so
 * it never breaks the page.
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
  try {
    return {
      publicApiKey: KNOCK_PUBLIC_API_KEY,
      feedChannelId: KNOCK_FEED_CHANNEL_ID,
      userId,
      userToken: await signUserToken(userId, {
        signingKey: KNOCK_SIGNING_KEY,
        expiresInSeconds: 60 * 60,
      }),
    };
  } catch (error) {
    console.error(
      `Notification Feed token for user ${userId} not signed: check KNOCK_SIGNING_KEY`,
      error
    );
    return null;
  }
}

/**
 * Records every trigger and sync, for tests to check what was sent. `archive`
 * matches on trigger data like Knock's `trigger_data` filter, moving what it
 * hits into `archived`. Preferences are kept in memory, with the same
 * defaults-only-if-none and merge rules as the Knock adapter.
 */
export function fakeNotifications(): Notifications &
  NotificationArchive &
  NotificationUsers & {
    triggers: NotificationTrigger[];
    archived: NotificationTrigger[];
    syncs: NotificationUser[];
  } {
  const triggers: NotificationTrigger[] = [];
  const archived: NotificationTrigger[] = [];
  const syncs: NotificationUser[] = [];
  const preferences = new Map<number, NotificationPreferences>();
  return {
    triggers,
    archived,
    syncs,
    async trigger(notification) {
      triggers.push(notification);
    },
    async archive(cause) {
      const matches = (t: NotificationTrigger) =>
        Object.entries(cause).every(
          ([key, value]) => (t.data as Record<string, unknown>)[key] === value
        );
      archived.push(
        ...triggers.filter((t) => matches(t) && !archived.includes(t))
      );
    },
    async syncUser(user) {
      syncs.push(user);
      if (!preferences.has(user.id)) {
        preferences.set(user.id, defaultPreferences());
      }
    },
    async getPreferences(userId) {
      return preferences.get(userId) ?? defaultPreferences();
    },
    async setPreference(userId, category, channel, enabled) {
      const current = preferences.get(userId) ?? defaultPreferences();
      preferences.set(
        userId,
        withPreference(current, category, channel, enabled)
      );
    },
  };
}
