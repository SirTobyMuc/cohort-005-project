import type { Db } from "~/lib/notes.server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  LessonProgressStatus,
  lessonProgress,
  lessons,
  modules,
  videoWatchEvents,
} from "~/db/schema";

export function getLessonProgress(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.lessonId, lessonId)
      )
    )
    .get();
}

export function getLessonProgressForCourse(
  db: Db,
  userId: number,
  courseId: number
) {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return [];

  const courseLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id))))
    .all();

  if (courseLessons.length === 0) return [];

  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        or(...courseLessons.map((l) => eq(lessonProgress.lessonId, l.id)))
      )
    )
    .all();
}

export function markLessonComplete(db: Db, userId: number, lessonId: number) {
  const existing = getLessonProgress(db, userId, lessonId);

  if (existing) {
    return db
      .update(lessonProgress)
      .set({
        status: LessonProgressStatus.Completed,
        completedAt: new Date().toISOString(),
      })
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(lessonProgress)
    .values({
      userId,
      lessonId,
      status: LessonProgressStatus.Completed,
      completedAt: new Date().toISOString(),
    })
    .returning()
    .get();
}

export function markLessonInProgress(db: Db, userId: number, lessonId: number) {
  const existing = getLessonProgress(db, userId, lessonId);

  if (existing) {
    if (existing.status === LessonProgressStatus.Completed) {
      return existing;
    }
    return db
      .update(lessonProgress)
      .set({ status: LessonProgressStatus.InProgress })
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(lessonProgress)
    .values({
      userId,
      lessonId,
      status: LessonProgressStatus.InProgress,
    })
    .returning()
    .get();
}

export function getLastWatchPosition(db: Db, userId: number, lessonId: number) {
  const lastEvent = db
    .select()
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        eq(videoWatchEvents.lessonId, lessonId)
      )
    )
    .orderBy(desc(videoWatchEvents.createdAt))
    .limit(1)
    .get();

  return lastEvent?.positionSeconds ?? 0;
}

export function calculateWatchProgress(
  db: Db,
  {
    userId,
    lessonId,
    videoDurationSeconds,
  }: { userId: number; lessonId: number; videoDurationSeconds: number }
) {
  if (videoDurationSeconds <= 0) return 0;

  const result = db
    .select({ maxPos: sql<number>`max(${videoWatchEvents.positionSeconds})` })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        eq(videoWatchEvents.lessonId, lessonId)
      )
    )
    .get();

  const maxPosition = result?.maxPos ?? 0;

  return Math.min(Math.round((maxPosition / videoDurationSeconds) * 100), 100);
}

/**
 * Marks the lesson in progress for this person and reads back everything the
 * page shows about their progress: the lesson's status, the status of every
 * lesson in the course, and where they are in the video.
 */
export function recordLessonVisit(
  db: Db,
  {
    userId,
    courseId,
    lesson,
  }: {
    userId: number;
    courseId: number;
    lesson: {
      id: number;
      videoUrl: string | null;
      durationMinutes: number | null;
    };
  }
) {
  markLessonInProgress(db, userId, lesson.id);
  const progress = getLessonProgress(db, userId, lesson.id);
  const lessonStatus: string | null = progress?.status ?? null;

  const lessonProgressMap: Record<number, string> = {};
  for (const record of getLessonProgressForCourse(db, userId, courseId)) {
    lessonProgressMap[record.lessonId] = record.status;
  }

  let lastWatchPosition = 0;
  let watchProgress = 0;
  if (lesson.videoUrl) {
    lastWatchPosition = getLastWatchPosition(db, userId, lesson.id);
    const videoDurationSeconds = (lesson.durationMinutes ?? 0) * 60;
    if (videoDurationSeconds > 0) {
      watchProgress = calculateWatchProgress(db, {
        userId,
        lessonId: lesson.id,
        videoDurationSeconds,
      });
    }
  }

  return { lessonStatus, lessonProgressMap, lastWatchPosition, watchProgress };
}
