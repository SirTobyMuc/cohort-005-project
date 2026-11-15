import { eq } from "drizzle-orm";
import { coupons, courses, purchases, UserRole, users } from "~/db/schema";
import { z } from "zod";
import type { Db } from "~/lib/refunds.server";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationUsers,
} from "~/lib/notifications.server";
import { parseFormData } from "~/lib/validation";

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
  // A Platform Admin is defined by role; everyone else by what they have.
  const isPlatformAdmin =
    db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .get()?.role === UserRole.Admin;

  // The Instructor of at least one course, like Notifications 5 and 6 go to.
  const isInstructor = !!db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, userId))
    .get();

  const hasPurchase = !!db
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .get();

  // Notification 4 goes to whoever bought the Team Licence. A Team Licence is
  // the Purchase that granted Seats.
  const boughtTeamLicence = !!db
    .select({ id: coupons.id })
    .from(purchases)
    .innerJoin(coupons, eq(coupons.purchaseId, purchases.id))
    .where(eq(purchases.userId, userId))
    .get();

  const applies: Record<NotificationCategory, boolean> = {
    refund_request_updates: hasPurchase,
    open_refund_requests: isPlatformAdmin,
    seat_claims: boughtTeamLicence,
    enrollments: isInstructor,
    discussion_questions: isInstructor,
    discussion_replies: true,
  };
  return NOTIFICATION_CATEGORIES.filter((category) => applies[category]);
}

const preferenceSchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORIES),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type SavePreferenceResult = { ok: true } | { ok: false; error: string };

/**
 * Saves one switch from the Notifications card: the category's `feed` channel.
 * Every other category is left as it was.
 */
export async function saveNotificationPreference(
  port: NotificationUsers,
  userId: number,
  formData: FormData
): Promise<SavePreferenceResult> {
  const parsed = parseFormData(formData, preferenceSchema);
  if (!parsed.success) {
    return { ok: false, error: "That notification setting isn't valid." };
  }

  const { category, enabled } = parsed.data;
  try {
    await port.setPreference(userId, category, "feed", enabled);
  } catch (error) {
    console.error("Failed to save notification preference", error);
    return {
      ok: false,
      error: "Couldn't save your notification settings. Try again.",
    };
  }
  return { ok: true };
}
