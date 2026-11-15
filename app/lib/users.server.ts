import { eq } from "drizzle-orm";
import { UserRole, users } from "~/db/schema";
import type { Db } from "~/lib/refunds.server";
import {
  syncNotificationUser,
  toNotificationUser,
  type Notifications,
} from "~/lib/notifications.server";

// ─── Users ───
// The lifecycle points that keep the Notifications vendor's copy of a user up
// to date: signup, a name change in /settings, a Platform Admin edit, and the
// seed / backfill. Each sync is best-effort and never fails the action.

export type User = typeof users.$inferSelect;

/**
 * Signs up a new Student, or returns the existing user with that email (who
 * is then just logged in). Only a new user is synced.
 */
export async function signUp(
  db: Db,
  input: { name: string; email: string },
  notifications: Notifications
): Promise<{ user: User; created: boolean }> {
  const existing = db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .get();
  if (existing) return { user: existing, created: false };

  const user = db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      role: UserRole.Student,
      avatarUrl: null,
    })
    .returning()
    .get();
  await syncNotificationUser(notifications, toNotificationUser(user));
  return { user, created: true };
}
