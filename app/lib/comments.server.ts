import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import { MIN_COMMENT_LENGTH, MAX_COMMENT_LENGTH } from "~/lib/comments";
import {
  sendNotification,
  toNotificationUser,
  type DiscussionNotificationData,
  type Notifications,
} from "~/lib/notifications.server";

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
    .select({
      courseId: courses.id,
      instructorId: courses.instructorId,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      lessonTitle: lessons.title,
    })
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
export async function createComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string,
  now: Date,
  notifications: Notifications
) {
  const trimmed = validateCommentBody(body);

  const course = getCourseForLesson(db, lessonId);
  if (!course) {
    throw new Error("Lesson not found");
  }

  let parent: ReturnType<typeof getCommentById> = undefined;
  if (parentId !== null) {
    parent = getCommentById(db, parentId);
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

  const comment = db
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

  // A Discussion Question goes to the Instructor, from anyone but them
  // (Platform Admins included).
  if (!parent && userId !== course.instructorId) {
    await sendNotification(notifications, {
      kind: "discussion_question",
      recipients: [toNotificationUser(getUser(db, course.instructorId))],
      sender: toNotificationUser(getUser(db, userId)),
      data: discussionData(course, comment),
      idempotencyKey: `discussion-question:${comment.id}`,
    });
  }

  // A Reply goes to the question's author only, unless they wrote it. There
  // is no thread following: earlier repliers aren't told.
  if (parent && userId !== parent.userId) {
    await sendNotification(notifications, {
      kind: "discussion_reply",
      recipients: [toNotificationUser(getUser(db, parent.userId))],
      sender: toNotificationUser(getUser(db, userId)),
      data: discussionData(course, comment),
      idempotencyKey: `discussion-reply:${comment.id}`,
    });
  }

  return comment;
}

function getUser(db: Db, userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

const SNIPPET_LENGTH = 140;

/** The comment's text as posted, on one line and cut to a feed-row length. */
function toSnippet(body: string) {
  const oneLine = body.replace(/\s+/g, " ");
  return oneLine.length > SNIPPET_LENGTH
    ? `${oneLine.slice(0, SNIPPET_LENGTH - 1).trimEnd()}…`
    : oneLine;
}

function discussionData(
  course: { courseTitle: string; courseSlug: string; lessonTitle: string },
  comment: { id: number; lessonId: number; body: string }
): DiscussionNotificationData {
  return {
    commentId: comment.id,
    courseTitle: course.courseTitle,
    lessonTitle: course.lessonTitle,
    snippet: toSnippet(comment.body),
    url: `/courses/${course.courseSlug}/lessons/${comment.lessonId}#comment-${comment.id}`,
  };
}

/**
 * Soft-deletes a comment by setting `deletedAt`. Authors may delete their own
 * comments; staff (the course's Instructor or a Platform Admin) may delete
 * anyone's. Deleting an already-deleted comment is a no-op that returns it.
 */
export async function deleteComment(
  db: Db,
  commentId: number,
  userId: number,
  isStaff: boolean,
  now: Date,
  notifications: Notifications
) {
  const existing = getCommentById(db, commentId);
  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.userId !== userId && !isStaff) {
    throw new Error("You can only delete your own comments");
  }
  if (existing.deletedAt !== null) {
    return existing;
  }

  return db
    .update(comments)
    .set({ deletedAt: now.toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();
}
