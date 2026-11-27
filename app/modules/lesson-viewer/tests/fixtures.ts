import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { markdown } from "~/lib/text";
import { createLessonViewer } from "../index.server";

/**
 * A course with two modules: "Basics" (lessons 1 and 2) and "Advanced"
 * (lesson 3). Lesson 1 has a ten-minute video. Course content belongs to the
 * instructor screens, not this module, so it is inserted directly.
 */
export function setUpCourse() {
  const db: TestDb = createTestDb();
  const base = seedBaseData(db);

  const addModule = (title: string, position: number) =>
    db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title, position })
      .returning()
      .get();

  const addLesson = (
    moduleId: number,
    values: { title: string; position: number; videoUrl?: string }
  ) =>
    db
      .insert(schema.lessons)
      .values({ moduleId, durationMinutes: 10, ...values })
      .returning()
      .get();

  // Inserted out of order to show the outline follows position, not id.
  const advanced = addModule("Advanced", 2);
  const basics = addModule("Basics", 1);
  const lesson3 = addLesson(advanced.id, { title: "Generics", position: 1 });
  const lesson2 = addLesson(basics.id, { title: "Types", position: 2 });
  const lesson1 = addLesson(basics.id, {
    title: "Setup",
    position: 1,
    videoUrl: "https://www.youtube.com/watch?v=abc",
  });

  return {
    db,
    base,
    viewer: createLessonViewer(db),
    modules: { basics, advanced },
    lessons: [lesson1, lesson2, lesson3] as const,
  };
}

export type CourseFixture = ReturnType<typeof setUpCourse>;

export function addStudent(db: TestDb, name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

export function watch(
  db: TestDb,
  event: {
    userId: number;
    lessonId: number;
    positionSeconds: number;
    createdAt?: string;
  }
) {
  db.insert(schema.videoWatchEvents)
    .values({ ...event, eventType: "progress" })
    .run();
}

export function postComment(
  db: TestDb,
  values: {
    lessonId: number;
    userId: number;
    body: string;
    parentId?: number;
    createdAt: string;
    deletedAt?: string;
  }
) {
  return db
    .insert(schema.comments)
    .values({ ...values, body: markdown(values.body) })
    .returning()
    .get();
}

/**
 * A two-question quiz on `lessonId`: a multiple-choice question whose second
 * option is right, and a true/false question whose first option is right.
 */
export function addQuiz(db: TestDb, lessonId: number) {
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check yourself", passingScore: 0.5 })
    .returning()
    .get();

  const addQuestion = (
    questionType: schema.QuestionType,
    position: number,
    options: Array<[string, boolean]>
  ) => {
    const question = db
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: `Question ${position}`,
        questionType,
        position,
      })
      .returning()
      .get();
    const ids = options.map(
      ([optionText, isCorrect]) =>
        db
          .insert(schema.quizOptions)
          .values({ questionId: question.id, optionText, isCorrect })
          .returning()
          .get().id
    );
    return { id: question.id, optionIds: ids };
  };

  // Inserted out of order to show questions follow position.
  const trueFalse = addQuestion(schema.QuestionType.TrueFalse, 2, [
    ["True", true],
    ["False", false],
  ]);
  const multipleChoice = addQuestion(schema.QuestionType.MultipleChoice, 1, [
    ["A", false],
    ["B", true],
    ["C", false],
  ]);

  return { quiz, multipleChoice, trueFalse };
}
