import { and, count, eq, isNull } from "drizzle-orm";
import { coupons, courses, purchases, users } from "~/db/schema";
import {
  enrollUser,
  findEnrollment,
  type Enrollment,
} from "~/lib/enrollments.server";
import {
  sendNotification,
  toNotificationUser,
  type Notifications,
} from "~/lib/notifications.server";
import { getSeatAvailability, type Db } from "~/lib/refunds.server";

// ─── Seats ───
// A Student claiming a Seat on a Team Licence. The Enrollment it gives goes
// through `enrollUser`, so there is one Enrollment path.

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type ClaimSeatResult =
  { ok: true; enrollment: Enrollment } | { ok: false; error: string };

export function getSeatByCode(db: Db, code: string) {
  return db.select().from(coupons).where(eq(coupons.code, code)).get();
}

/**
 * Claims the Seat with this code for a Student and enrolls them. Refused if the
 * Seat is unknown, already claimed, can't be claimed right now, the Student is
 * already enrolled, or they are in a different country from the purchaser.
 * A claim tells the Team Admin (Notification 4) and, through `enrollUser`, the
 * Instructor (Notification 5), best-effort.
 */
export async function claimSeat(
  db: Db,
  code: string,
  userId: number,
  userCountry: string,
  now: Date,
  notifications: Notifications
): Promise<ClaimSeatResult> {
  const seat = getSeatByCode(db, code);
  if (!seat) {
    return { ok: false, error: "Seat not found" };
  }

  if (seat.redeemedByUserId !== null) {
    return { ok: false, error: "This Seat has already been claimed" };
  }

  const availability = getSeatAvailability(db, seat);
  if (availability === "on_hold") {
    return { ok: false, error: SEAT_ON_HOLD };
  }
  if (availability === "refunded") {
    return { ok: false, error: SEAT_REFUNDED };
  }

  if (findEnrollment(db, userId, seat.courseId)) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();

  if (purchase?.country && purchase.country !== userCountry) {
    return {
      ok: false,
      error:
        "This Seat can only be claimed from the same country as the purchaser",
    };
  }

  db.update(coupons)
    .set({ redeemedByUserId: userId, redeemedAt: now.toISOString() })
    .where(eq(coupons.id, seat.id))
    .run();

  await notifySeatClaimed(db, seat, userId, notifications);
  const enrollment = await enrollUser(
    db,
    userId,
    seat.courseId,
    now,
    notifications
  );

  return { ok: true, enrollment };
}

type Seat = typeof coupons.$inferSelect;

/** Notification 4: to the Team Admin who bought the Seat's Team Licence. */
async function notifySeatClaimed(
  db: Db,
  seat: Seat,
  studentId: number,
  notifications: Notifications
) {
  const teamAdmin = db
    .select({ user: users })
    .from(purchases)
    .innerJoin(users, eq(users.id, purchases.userId))
    .where(eq(purchases.id, seat.purchaseId))
    .get()?.user;
  const student = db.select().from(users).where(eq(users.id, studentId)).get();
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();
  if (!teamAdmin || !student || !course) return;

  const seatsLeft =
    db
      .select({ n: count() })
      .from(coupons)
      .where(
        and(
          eq(coupons.purchaseId, seat.purchaseId),
          isNull(coupons.redeemedByUserId)
        )
      )
      .get()?.n ?? 0;

  await sendNotification(notifications, {
    kind: "seat_claimed",
    recipients: [toNotificationUser(teamAdmin)],
    sender: toNotificationUser(student),
    data: {
      seatId: seat.id,
      courseTitle: course.title,
      seatsLeft,
      url: "/team",
    },
    idempotencyKey: `seat-claimed:${seat.id}`,
  });
}
