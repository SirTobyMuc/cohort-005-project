import { eq } from "drizzle-orm";
import { purchases } from "~/db/schema";
import type { Db } from "~/lib/refunds.server";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from "~/lib/notifications.server";

// ─── Notification settings ───
// What the Notifications card on /settings shows and saves.

/**
 * The categories a person gets a switch for, worked out from what they are or
 * have rather than from their role alone. In `NOTIFICATION_CATEGORIES` order.
 */
export function visibleNotificationCategories(
  db: Db,
  userId: number
): NotificationCategory[] {
  const hasPurchase = !!db
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .get();

  const applies: Record<NotificationCategory, boolean> = {
    refund_request_updates: hasPurchase,
    open_refund_requests: false,
    seat_claims: false,
    enrollments: false,
    discussion_questions: false,
    discussion_replies: true,
  };
  return NOTIFICATION_CATEGORIES.filter((category) => applies[category]);
}
