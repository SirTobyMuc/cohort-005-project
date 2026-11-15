import { z } from "zod";
import type { FeedNotification } from "~/lib/notification-feed";
import {
  notificationSchema,
  type NotificationKind,
} from "~/lib/notification-kinds";

// ─── Knock workflows ───
// The one place that knows Knock's workflow keys. The server adapter
// (notifications.server.ts) triggers them and the feed's Knock adapter
// (notification-feed.knock.ts) reads them back, so this module holds no
// server-only code. Each Notification is one workflow, and the workflow
// carries its preference category (see knock/workflows on the
// knock-workflows branch).

export const KNOCK_WORKFLOW_KEYS: Record<NotificationKind, string> = {
  refund_request_confirmation: "refund-request-confirmation",
  open_refund_request: "open-refund-request",
  refund_request_approved: "refund-request-approved",
  refund_request_declined: "refund-request-declined",
  seat_claimed: "seat-claimed",
  new_enrollment: "new-enrollment",
  discussion_question: "discussion-question",
  discussion_reply: "discussion-reply",
};

const KINDS_BY_WORKFLOW_KEY = new Map(
  Object.entries(KNOCK_WORKFLOW_KEYS).map(([kind, key]) => [key, kind])
);

// The parts of a Knock feed item Cadence reads.
const knockFeedItemSchema = z.object({
  id: z.string(),
  source: z.object({ key: z.string() }),
  data: z.unknown(),
  actors: z.array(z.unknown()),
  inserted_at: z.string(),
  read_at: z.string().nullable(),
  seen_at: z.string().nullable(),
});

const knockActorSchema = z.object({
  name: z.string(),
  avatar: z.string().nullish(),
});

function toSender(actor: unknown): FeedNotification["sender"] {
  const parsed = knockActorSchema.safeParse(actor);
  if (!parsed.success) return null;
  return { name: parsed.data.name, avatar: parsed.data.avatar ?? null };
}

/**
 * One Knock feed item as a Notification in the feed, or null to leave it out:
 * a workflow Cadence doesn't know, or data that doesn't fit its kind (logged).
 */
export function toFeedNotification(item: unknown): FeedNotification | null {
  const parsedItem = knockFeedItemSchema.safeParse(item);
  if (!parsedItem.success) {
    console.error("Knock feed item left out of the feed:", parsedItem.error);
    return null;
  }
  const { id, source, data, actors, inserted_at, read_at, seen_at } =
    parsedItem.data;
  const kind = KINDS_BY_WORKFLOW_KEY.get(source.key);
  if (!kind) return null;
  const notification = notificationSchema.safeParse({ kind, data });
  if (!notification.success) {
    console.error(
      `Knock feed item ${id} (${source.key}) left out of the feed:`,
      notification.error
    );
    return null;
  }
  return {
    ...notification.data,
    id,
    sender: toSender(actors[0]),
    insertedAt: inserted_at,
    readAt: read_at,
    seenAt: seen_at,
  };
}
