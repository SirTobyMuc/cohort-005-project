import Knock, { type FeedItem } from "@knocklabs/client";
import { toFeedNotification } from "~/lib/knock-workflows";
import type { NotificationFeedConfig } from "~/lib/notifications.server";
import type {
  FeedNotification,
  NotificationCounts,
  NotificationFeed,
} from "~/lib/notification-feed";

// The Knock adapter for the client port. The only browser code that talks to
// Knock. Loaded with a dynamic import, so it never runs on the server.
// Mapping feed items to Notifications (knock-workflows.ts) is tested; the
// rest is checked by hand against Knock Development (see #46).

const PAGE_SIZE = 20;

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
