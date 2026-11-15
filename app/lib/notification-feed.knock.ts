import Knock, { type FeedItem, type Recipient } from "@knocklabs/client";
import type {
  NotificationFeedConfig,
  NotificationKind,
} from "~/lib/notifications.server";
import type {
  FeedNotification,
  NotificationCounts,
  NotificationFeed,
} from "~/lib/notification-feed";

// The Knock adapter for the client port. The only browser code that knows
// Knock. Loaded with a dynamic import, so it never runs on the server.
// No automated tests (see #46): check it by hand against Knock Development.

const PAGE_SIZE = 20;

// The reverse of KNOCK_WORKFLOW_KEYS in notifications.server.ts. A workflow
// missing here is left out of the feed.
const KINDS_BY_WORKFLOW_KEY: Partial<Record<string, NotificationKind>> = {
  "refund-request-confirmation": "refund_request_confirmation",
  "open-refund-request": "open_refund_request",
  "refund-request-approved": "refund_request_approved",
  "refund-request-declined": "refund_request_declined",
};

function toSender(actor: Recipient | undefined): FeedNotification["sender"] {
  if (!actor || !("name" in actor) || typeof actor.name !== "string") {
    return null;
  }
  return {
    name: actor.name,
    avatar: typeof actor.avatar === "string" ? actor.avatar : null,
  };
}

function toFeedNotification(item: FeedItem): FeedNotification | null {
  const kind = KINDS_BY_WORKFLOW_KEY[item.source.key];
  if (!kind || !item.data) return null;
  // Knock hands back the `data` the server port triggered this workflow with,
  // so it has that kind's shape.
  return {
    kind,
    data: item.data,
    id: item.id,
    sender: toSender(item.actors[0]),
    insertedAt: item.inserted_at,
    readAt: item.read_at,
    seenAt: item.seen_at,
  } as FeedNotification;
}

function toFeedNotifications(items: FeedItem[]): FeedNotification[] {
  return items.flatMap((item) => toFeedNotification(item) ?? []);
}

/**
 * One person's feed over one real-time socket. Nothing polls: Knock
 * rate-limits at about 10 quick reads. `close` tears the socket down, so a
 * DevUI user switch closes this feed and opens a new one with a fresh token.
 */
export function knockNotificationFeed(
  config: NotificationFeedConfig,
  /** The newest token the server has given for this user, before expiry. */
  latestUserToken: () => string | undefined
): NotificationFeed {
  const knock = new Knock(config.publicApiKey);
  knock.authenticate(config.userId, config.userToken, {
    // Cadence syncs users from the server; the browser only reads its feed.
    identificationStrategy: "skip",
    onUserTokenExpiring: async () => latestUserToken(),
  });
  const feed = knock.feeds.initialize(config.feedChannelId, {
    page_size: PAGE_SIZE,
    archived: "exclude",
  });
  feed.listenForUpdates();

  function counts(): NotificationCounts {
    const { metadata } = feed.getState();
    return { unseen: metadata.unseen_count, unread: metadata.unread_count };
  }

  return {
    async listNotifications(cursor) {
      const result = await feed.fetch(cursor ? { after: cursor } : {});
      if (result?.status !== "ok") {
        throw new Error(`Couldn't load Notifications: ${result?.status}`);
      }
      return {
        notifications: toFeedNotifications(result.data.entries),
        nextCursor: result.data.page_info.after,
      };
    },
    counts,
    async markRead(ids) {
      // Never send the batch endpoints an empty list: Knock returns a 422.
      if (ids.length === 0) return;
      const { items } = feed.getState();
      const toMark = items.filter((item) => ids.includes(item.id));
      if (toMark.length > 0) await feed.markAsRead(toMark);
    },
    async markAllRead() {
      await feed.markAllAsRead();
    },
    async markAllSeen() {
      await feed.markAllAsSeen();
    },
    subscribe(onChange) {
      const onRealtime = ({ items }: { items: FeedItem[] }) =>
        onChange({ received: toFeedNotifications(items), counts: counts() });
      feed.on("items.received.realtime", onRealtime);
      const unsubscribeStore = feed.store.subscribe(() =>
        onChange({ received: [], counts: counts() })
      );
      return () => {
        feed.off("items.received.realtime", onRealtime);
        unsubscribeStore();
      };
    },
    close() {
      feed.dispose();
      knock.teardown();
    },
  };
}
