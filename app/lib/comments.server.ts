import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { comments, courses, lessons, modules } from "~/db/schema";
import { MIN_COMMENT_LENGTH, MAX_COMMENT_LENGTH } from "~/lib/comments";

// ─── Comments ───
// Writing Discussion Questions and Replies, and soft-deleting them. Routes call
// these so the write rules live in one place. Every function takes the
// database first and `now` last, so tests can hand in an in-memory database
// and a fixed clock. Uses positional parameters (project convention).
//
// Validation failures throw an Error whose message is safe to show the user.

export type Db = BetterSQLite3Database<typeof schema>;

export function getCommentById(db: Db, commentId: number) {
  return db.select().from(comments).where(eq(comments.id, commentId)).get();
}

/** Trims a comment body and checks its length, throwing a user-facing Error. */
export function validateCommentBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }
  return trimmed;
}

function getCourseForLesson(db: Db, lessonId: number) {
  return db
    .select({ courseId: courses.id, instructorId: courses.instructorId })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

/**
 * Posts a Discussion Question (parentId null) or a Reply to one. Replies are
 * one level deep and must sit on the same lesson as their question.
 */
export function createComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string,
  now: Date
) {
  const trimmed = validateCommentBody(body);

  const course = getCourseForLesson(db, lessonId);
  if (!course) {
    throw new Error("Lesson not found");
  }

  if (parentId !== null) {
    const parent = getCommentById(db, parentId);
    if (!parent) {
      throw new Error("Parent comment not found");
    }
    if (parent.lessonId !== lessonId) {
      throw new Error("Parent comment belongs to a different lesson");
    }
    if (parent.parentId !== null) {
      throw new Error("Replies can only be one level deep");
    }
  }

  return db
    .insert(comments)
    .values({
      userId,
      lessonId,
      parentId,
      body: trimmed,
      createdAt: now.toISOString(),
    })
    .returning()
    .get();
}
