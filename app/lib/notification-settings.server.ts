import { and, eq } from "drizzle-orm";
import {
  coupons,
  purchases,
  teamMembers,
  TeamMemberRole,
  UserRole,
  users,
} from "~/db/schema";
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
  const role = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get()?.role;
  const isInstructor = role === UserRole.Instructor;
  const isPlatformAdmin = role === UserRole.Admin;

  const hasPurchase = !!db
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .get();

  // Every Team Licence grants Seats, so a team with a Seat has a Team Licence.
  const isTeamAdminOnLicence = !!db
    .select({ id: coupons.id })
    .from(teamMembers)
    .innerJoin(coupons, eq(coupons.teamId, teamMembers.teamId))
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();

  const applies: Record<NotificationCategory, boolean> = {
    refund_request_updates: hasPurchase,
    open_refund_requests: isPlatformAdmin,
    seat_claims: isTeamAdminOnLicence,
    enrollments: isInstructor,
    discussion_questions: isInstructor,
    discussion_replies: true,
  };
  return NOTIFICATION_CATEGORIES.filter((category) => applies[category]);
}
