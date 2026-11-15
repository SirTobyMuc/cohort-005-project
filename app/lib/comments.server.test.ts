import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment } from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  [lessonId, otherLessonId] = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

describe("createComment", () => {
  it("posts a Discussion Question with a trimmed body, dated now", () => {
    const question = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "  How do closures work?  ",
      NOW
    );

    expect(question).toMatchObject({
      userId: base.user.id,
      lessonId,
      parentId: null,
      body: "How do closures work?",
      createdAt: NOW.toISOString(),
      deletedAt: null,
    });
  });

  it("posts a Reply under a Discussion Question", () => {
    const question = createComment(db, base.user.id, lessonId, null, "Q?", NOW);

    const reply = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "Answer",
      NOW
    );

    expect(reply).toMatchObject({
      userId: base.instructor.id,
      lessonId,
      parentId: question.id,
      body: "Answer",
    });
  });

  it("refuses a Reply to a Reply", () => {
    const question = createComment(db, base.user.id, lessonId, null, "Q?", NOW);
    const reply = createComment(db, base.instructor.id, lessonId, question.id, "A", NOW);

    expect(() =>
      createComment(db, base.user.id, lessonId, reply.id, "Nested", NOW)
    ).toThrow("Replies can only be one level deep");
  });

  it("refuses a Reply to a question on a different lesson", () => {
    const question = createComment(db, base.user.id, otherLessonId, null, "Q?", NOW);

    expect(() =>
      createComment(db, base.instructor.id, lessonId, question.id, "A", NOW)
    ).toThrow("Parent comment belongs to a different lesson");
  });

  it("refuses a Reply to a comment that doesn't exist", () => {
    expect(() =>
      createComment(db, base.user.id, lessonId, 9999, "A", NOW)
    ).toThrow("Parent comment not found");
  });

  it("refuses a comment on a lesson that doesn't exist", () => {
    expect(() =>
      createComment(db, base.user.id, 9999, null, "Q?", NOW)
    ).toThrow("Lesson not found");
  });

  it("refuses an empty or over-long body", () => {
    expect(() =>
      createComment(db, base.user.id, lessonId, null, "   ", NOW)
    ).toThrow("Comment cannot be empty");
    expect(() =>
      createComment(db, base.user.id, lessonId, null, "x".repeat(5001), NOW)
    ).toThrow("Comment must be 5000 characters or fewer");
  });
});
