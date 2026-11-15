import type { Notification } from "~/lib/notifications.server";
import { formatPrice } from "~/lib/utils";

// ─── Notification Feed (client port) ───
// The Cadence-owned interface the feed components call. Only its adapter
// (notification-feed.knock.ts) knows Knock; without Knock keys the feed is
// the empty adapter below. See #46.

/** One Notification as it sits in a person's Notification Feed. */
export type FeedNotification = Notification & {
  id: string;
  /** Who caused it, as they are now. Null for Notifications from Cadence. */
  sender: { name: string; avatar: string | null } | null;
  insertedAt: string;
  readAt: string | null;
  seenAt: string | null;
};

export type NotificationCounts = { unseen: number; unread: number };

export type NotificationPage = {
  /** Newest first. */
  notifications: FeedNotification[];
  /** Pass to `listNotifications` for the next (older) page; null at the end. */
  nextCursor: string | null;
};

export type NotificationFeedChange = {
  /** Notifications that arrived live, newest first. */
  received: FeedNotification[];
  counts: NotificationCounts;
};

export interface NotificationFeed {
  /** A page of Notifications, newest first. Null cursor = the first page. */
  listNotifications(cursor: string | null): Promise<NotificationPage>;
  counts(): NotificationCounts;
  markRead(ids: string[]): Promise<void>;
  /** Every Notification, including ones that haven't loaded yet. */
  markAllRead(): Promise<void>;
  /** Every Notification, including ones that haven't loaded yet. */
  markAllSeen(): Promise<void>;
  /** Called when Notifications arrive live or the counts change. */
  subscribe(onChange: (change: NotificationFeedChange) => void): () => void;
  /** Tears down the live connection. */
  close(): void;
}

/** The feed without Knock keys: always empty, never errors. */
export function emptyNotificationFeed(): NotificationFeed {
  return {
    async listNotifications() {
      return { notifications: [], nextCursor: null };
    },
    counts() {
      return { unseen: 0, unread: 0 };
    },
    async markRead() {},
    async markAllRead() {},
    async markAllSeen() {},
    subscribe() {
      return () => {};
    },
    close() {},
  };
}

// ─── Loaded rows ───
// The adapter only reports counts, so the feed UI updates the rows it has
// loaded itself, optimistically, when it marks them read or seen.

/** Marks the given loaded rows read at `at`; rows already read keep their time. */
export function markLoadedRead(
  notifications: FeedNotification[],
  ids: string[],
  at: string
): FeedNotification[] {
  return notifications.map((n) =>
    ids.includes(n.id) && n.readAt === null ? { ...n, readAt: at } : n
  );
}

// ─── Row text ───
// Cadence writes each row from the Notification's data, not Knock templates.

export type NotificationCategory =
  "discussion" | "refund" | "team" | "enrollment";

export type NotificationRow = {
  category: NotificationCategory;
  title: string;
  /** One line: a snippet of what was said, or context. */
  snippet: string;
};

function senderName(notification: FeedNotification) {
  return notification.sender?.name ?? "Someone";
}

export function describeNotification(
  notification: FeedNotification
): NotificationRow {
  switch (notification.kind) {
    case "refund_request_confirmation": {
      const { amount, courseTitle } = notification.data;
      return {
        category: "refund",
        title: "We've received your Refund Request",
        snippet: `${formatPrice(amount)} for ${courseTitle} is under review.`,
      };
    }
    case "open_refund_request": {
      const { amount, courseTitle, reason } = notification.data;
      return {
        category: "refund",
        title: `${senderName(notification)} requested a ${formatPrice(amount)} refund`,
        snippet: `${courseTitle}: “${reason}”`,
      };
    }
    case "refund_request_approved": {
      const { amount, courseTitle, decisionNote } = notification.data;
      return {
        category: "refund",
        title: "Your Refund Request was approved",
        snippet: decisionNote
          ? `${formatPrice(amount)} for ${courseTitle}: “${decisionNote}”`
          : `${formatPrice(amount)} for ${courseTitle} will be refunded.`,
      };
    }
    case "refund_request_declined": {
      const { courseTitle, decisionNote } = notification.data;
      return {
        category: "refund",
        title: "Your Refund Request was declined",
        snippet: `${courseTitle}: “${decisionNote}” You can ask again.`,
      };
    }
    case "discussion_question": {
      const { lessonTitle, snippet } = notification.data;
      return {
        category: "discussion",
        title: `${senderName(notification)} asked a question on ${lessonTitle}`,
        snippet: `“${snippet}”`,
      };
    }
    case "discussion_reply": {
      const { lessonTitle, snippet } = notification.data;
      return {
        category: "discussion",
        title: `${senderName(notification)} replied to your question on ${lessonTitle}`,
        snippet: `“${snippet}”`,
      };
    }
    // A kind added to the server port before it has row text here.
    default:
      return {
        category: "discussion",
        title: "You have a new Notification",
        snippet: "",
      };
  }
}
