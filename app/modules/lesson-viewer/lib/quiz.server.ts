import type { Db } from "~/lib/notes.server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  quizAnswers,
  quizAttempts,
  quizOptions,
  quizQuestions,
  quizzes,
} from "~/db/schema";

export function getQuizByLessonId(db: Db, lessonId: number) {
  return db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).get();
}

export function getQuizWithQuestions(db: Db, quizId: number) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) return null;

  const questions = db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();

  const options = listOptions(
    db,
    questions.map((q) => q.id)
  );
  const questionsWithOptions = questions.map((question) => ({
    ...question,
    options: options.filter((o) => o.questionId === question.id),
  }));

  return { ...quiz, questions: questionsWithOptions };
}

function listOptions(db: Db, questionIds: number[]) {
  if (questionIds.length === 0) return [];
  return db
    .select()
    .from(quizOptions)
    .where(inArray(quizOptions.questionId, questionIds))
    .orderBy(asc(quizOptions.id))
    .all();
}

export function getBestAttempt(db: Db, userId: number, quizId: number) {
  return db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

export function calculateGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

export function computeResult(
  db: Db,
  {
    userId,
    quizId,
    selectedAnswers,
  }: { userId: number; quizId: number; selectedAnswers: Record<number, number> }
) {
  try {
    const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) {
      console.error("quiz not found");
      return null;
    }

    const questions = db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(quizQuestions.position)
      .all();

    const options = listOptions(
      db,
      questions.map((q) => q.id)
    );

    let correct = 0;
    const total = questions.length;
    const questionResults: QuestionResult[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const selected = selectedAnswers[q.id];

      if (!selected) {
        questionResults.push({
          questionId: q.id,
          correct: false,
          selectedOptionId: null,
          correctOptionId: null,
        });
        continue;
      }

      const correctOptionId =
        options.find((o) => o.questionId === q.id && o.isCorrect)?.id ?? null;

      const isCorrect = selected === correctOptionId;
      if (isCorrect) correct++;

      questionResults.push({
        questionId: q.id,
        correct: isCorrect,
        selectedOptionId: selected,
        correctOptionId,
      });
    }

    const scoreValue = total > 0 ? correct / total : 0;
    const passed = scoreValue > 0.7;
    const grade = calculateGrade(scoreValue);

    const attempt = db.transaction((tx) => {
      const inserted = tx
        .insert(quizAttempts)
        .values({ userId, quizId, score: scoreValue, passed })
        .returning()
        .get();

      const answers = questionResults.flatMap((result) =>
        result.selectedOptionId === null
          ? []
          : [
              {
                attemptId: inserted.id,
                questionId: result.questionId,
                selectedOptionId: result.selectedOptionId,
              },
            ]
      );
      if (answers.length > 0) tx.insert(quizAnswers).values(answers).run();

      return inserted;
    });

    return {
      attemptId: attempt.id,
      score: scoreValue,
      passed,
      grade,
      totalCorrect: correct,
      totalQuestions: total,
      questionResults,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

export function getQuizById(db: Db, quizId: number) {
  return db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
}

export type LessonQuiz = {
  id: number;
  title: string;
  passingScore: number;
  questions: Array<{
    id: number;
    questionText: string;
    questionType: string;
    position: number;
    options: Array<{ id: number; optionText: string }>;
  }>;
};

/**
 * The lesson's quiz as the Student sees it, without the answers, and their
 * best attempt so far.
 */
export function getLessonQuiz(
  db: Db,
  lessonId: number,
  userId: number | null
): {
  quiz: LessonQuiz | null;
  bestAttempt: { score: number; passed: boolean } | null;
} {
  const quizRecord = getQuizByLessonId(db, lessonId);
  if (!quizRecord) return { quiz: null, bestAttempt: null };

  let quiz: LessonQuiz | null = null;
  const quizData = getQuizWithQuestions(db, quizRecord.id);
  if (quizData) {
    // Strip isCorrect from options so answers aren't leaked to the client
    quiz = {
      id: quizData.id,
      title: quizData.title,
      passingScore: quizData.passingScore,
      questions: quizData.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        position: q.position,
        options: q.options.map((o) => ({
          id: o.id,
          optionText: o.optionText,
        })),
      })),
    };
  }

  const best = userId ? getBestAttempt(db, userId, quizRecord.id) : undefined;
  const bestAttempt = best ? { score: best.score, passed: best.passed } : null;

  return { quiz, bestAttempt };
}
