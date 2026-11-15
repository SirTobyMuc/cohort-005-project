import { and, eq } from "drizzle-orm";
import { courses, enrollments } from "~/db/schema";
import type { Db } from "~/lib/refunds.server";

// ─── Enrollments ───
// The one path that creates an Enrollment, whether it comes from an Individual
// Purchase or a Claimed Seat (including a Lapsed Student enrolling again).
// Takes the database first and a fixed `now`, so tests can hand in their own.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

export type Enrollment = typeof enrollments.$inferSelect;

export function findEnrollment(
  db: Queryable,
  userId: number,
  courseId: number
): Enrollment | undefined {
  return db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

/**
 * Gives a Student an Enrollment on a course. Throws if they already have one
 * (a Student has at most one Enrollment per course) or the course is missing.
 */
export function enrollUser(
  db: Queryable,
  userId: number,
  courseId: number,
  now: Date
): Enrollment {
  if (findEnrollment(db, userId, courseId)) {
    throw new Error("User is already enrolled in this course");
  }

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) {
    throw new Error("Course not found");
  }

  return db
    .insert(enrollments)
    .values({ userId, courseId, enrolledAt: now.toISOString() })
    .returning()
    .get();
}
