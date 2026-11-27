import { db as appDb } from "~/db";
import type { Db } from "~/lib/notes.server";
import {
  buildCurriculum,
  findAdjacentLessons,
  getCourseWithDetails,
  getLessonById,
  getModuleById,
  getUserById,
} from "./lib/course.server";
import { markLessonComplete, recordLessonVisit } from "./lib/progress.server";
import {
  getCommentById,
  getLessonThread,
  renderThread,
} from "./lib/thread.server";
import { computeResult, getLessonQuiz, getQuizById } from "./lib/quiz.server";

export type { LessonQuiz, QuizResult } from "./lib/quiz.server";

/**
 * The data behind a Student's lesson page: the course outline, their
 * progress, the discussion thread and the quiz. The app uses `lessonViewer`,
 * which reads the app database; tests build their own against a test
 * database.
 */
export function createLessonViewer(db: Db) {
  return {
    getCourseWithDetails: (courseId: number) =>
      getCourseWithDetails(db, courseId),
    getLesson: (lessonId: number) => getLessonById(db, lessonId),
    getModule: (moduleId: number) => getModuleById(db, moduleId),
    getUser: (userId: number) => getUserById(db, userId),
    buildCurriculum,
    findAdjacentLessons,

    /**
     * Marks the lesson in progress and reads back the person's progress
     * through the course and the video.
     */
    recordLessonVisit: (visit: Parameters<typeof recordLessonVisit>[1]) =>
      recordLessonVisit(db, visit),
    markLessonComplete: (
      completion: Parameters<typeof markLessonComplete>[1]
    ) => markLessonComplete(db, completion),

    getComment: (commentId: number) => getCommentById(db, commentId),
    /** The lesson's discussion, with every body rendered to safe HTML. */
    getRenderedThread: async (lessonId: number) =>
      renderThread(getLessonThread(db, lessonId)),

    getQuiz: (quizId: number) => getQuizById(db, quizId),
    getLessonQuiz: (lessonId: number, userId: number | null) =>
      getLessonQuiz(db, lessonId, userId),
    /** Scores the answers (questionId → optionId) and records the attempt. */
    submitQuiz: (submission: Parameters<typeof computeResult>[1]) =>
      computeResult(db, submission),
  };
}

export const lessonViewer = createLessonViewer(appDb);
