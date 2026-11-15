import { eq } from "drizzle-orm";
import { coupons, purchases } from "~/db/schema";
import {
  enrollUser,
  findEnrollment,
  type Enrollment,
} from "~/lib/enrollments.server";
import { getSeatAvailability, type Db } from "~/lib/refunds.server";

// ─── Seats ───
// A Student claiming a Seat on a Team Licence. The Enrollment it gives goes
// through `enrollUser`, so there is one Enrollment path.

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type RedeemResult =
  { ok: true; enrollment: Enrollment } | { ok: false; error: string };

export function getSeatByCode(db: Db, code: string) {
  return db.select().from(coupons).where(eq(coupons.code, code)).get();
}

/**
 * Claims the Seat with this code for a Student and enrolls them. Refused if the
 * Seat is unknown, already claimed, can't be claimed right now, the Student is
 * already enrolled, or they are in a different country from the purchaser.
 */
export function redeemCoupon(
  db: Db,
  code: string,
  userId: number,
  userCountry: string,
  now: Date
): RedeemResult {
  const coupon = getSeatByCode(db, code);
  if (!coupon) {
    return { ok: false, error: "Coupon not found" };
  }

  if (coupon.redeemedByUserId !== null) {
    return { ok: false, error: "Coupon has already been redeemed" };
  }

  const availability = getSeatAvailability(db, coupon);
  if (availability === "on_hold") {
    return { ok: false, error: SEAT_ON_HOLD };
  }
  if (availability === "refunded") {
    return { ok: false, error: SEAT_REFUNDED };
  }

  if (findEnrollment(db, userId, coupon.courseId)) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, coupon.purchaseId))
    .get();

  if (purchase?.country && purchase.country !== userCountry) {
    return {
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  db.update(coupons)
    .set({ redeemedByUserId: userId, redeemedAt: now.toISOString() })
    .where(eq(coupons.id, coupon.id))
    .run();

  const enrollment = enrollUser(db, userId, coupon.courseId, now);

  return { ok: true, enrollment };
}
