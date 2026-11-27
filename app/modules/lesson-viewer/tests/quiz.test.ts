import { describe, it, expect } from "vitest";
import { addQuiz, setUpCourse } from "./fixtures";

describe("the lesson's quiz", () => {
  it("has none when the lesson has no quiz", () => {
    const { viewer, base, lessons } = setUpCourse();

    expect(viewer.getLessonQuiz(lessons[0].id, base.user.id)).toEqual({
      quiz: null,
      bestAttempt: null,
    });
  });

  it("lists questions in position order without revealing the answers", () => {
    const { db, viewer, lessons } = setUpCourse();
    const { quiz, multipleChoice, trueFalse } = addQuiz(db, lessons[0].id);

    const shown = viewer.getLessonQuiz(lessons[0].id, null).quiz;

    expect(shown).toMatchObject({
      id: quiz.id,
      title: "Check yourself",
      passingScore: 0.5,
    });
    expect(shown?.questions.map((q) => q.id)).toEqual([
      multipleChoice.id,
      trueFalse.id,
    ]);
    expect(shown?.questions[0].options).toEqual([
      { id: multipleChoice.optionIds[0], optionText: "A" },
      { id: multipleChoice.optionIds[1], optionText: "B" },
      { id: multipleChoice.optionIds[2], optionText: "C" },
    ]);
    expect(JSON.stringify(shown)).not.toContain("isCorrect");
  });
});

describe("submitting a quiz", () => {
  it("scores every answer right as a pass with an A", () => {
    const { db, viewer, base, lessons } = setUpCourse();
    const { quiz, multipleChoice, trueFalse } = addQuiz(db, lessons[0].id);

    const result = viewer.submitQuiz({
      userId: base.user.id,
      quizId: quiz.id,
      selectedAnswers: {
        [multipleChoice.id]: multipleChoice.optionIds[1],
        [trueFalse.id]: trueFalse.optionIds[0],
      },
    });

    expect(result).toMatchObject({
      score: 1,
      passed: true,
      grade: "A",
      totalCorrect: 1 + 1,
      totalQuestions: 2,
    });
    expect(result?.questionResults).toEqual([
      {
        questionId: multipleChoice.id,
        correct: true,
        selectedOptionId: multipleChoice.optionIds[1],
        correctOptionId: multipleChoice.optionIds[1],
      },
      {
        questionId: trueFalse.id,
        correct: true,
        selectedOptionId: trueFalse.optionIds[0],
        correctOptionId: trueFalse.optionIds[0],
      },
    ]);
  });

  it("marks a wrong answer and a skipped question as incorrect", () => {
    const { db, viewer, base, lessons } = setUpCourse();
    const { quiz, multipleChoice, trueFalse } = addQuiz(db, lessons[0].id);

    const result = viewer.submitQuiz({
      userId: base.user.id,
      quizId: quiz.id,
      selectedAnswers: { [multipleChoice.id]: multipleChoice.optionIds[0] },
    });

    expect(result).toMatchObject({
      score: 0,
      passed: false,
      grade: "F",
      totalCorrect: 0,
    });
    expect(result?.questionResults[0]).toMatchObject({
      correct: false,
      correctOptionId: multipleChoice.optionIds[1],
    });
    expect(result?.questionResults[1]).toEqual({
      questionId: trueFalse.id,
      correct: false,
      selectedOptionId: null,
      correctOptionId: null,
    });
  });

  it("remembers the best attempt", () => {
    const { db, viewer, base, lessons } = setUpCourse();
    const { quiz, trueFalse } = addQuiz(db, lessons[0].id);
    const submit = (answers: Record<number, number>) =>
      viewer.submitQuiz({
        userId: base.user.id,
        quizId: quiz.id,
        selectedAnswers: answers,
      });
    submit({ [trueFalse.id]: trueFalse.optionIds[0] });
    submit({});

    expect(
      viewer.getLessonQuiz(lessons[0].id, base.user.id).bestAttempt
    ).toEqual({ score: 0.5, passed: false });
    expect(viewer.getLessonQuiz(lessons[0].id, null).bestAttempt).toBeNull();
  });

  it("finds a quiz by id and gives no result for an unknown quiz", () => {
    const { db, viewer, base, lessons } = setUpCourse();
    const { quiz } = addQuiz(db, lessons[0].id);

    expect(viewer.getQuiz(quiz.id)?.lessonId).toBe(lessons[0].id);
    expect(
      viewer.submitQuiz({
        userId: base.user.id,
        quizId: 9999,
        selectedAnswers: {},
      })
    ).toBeNull();
  });
});
