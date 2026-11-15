import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment, deleteComment } from "./comments.server";

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

describe("deleteComment", () => {
  const LATER = new Date(2026, 9, 7, 9, 0, 0);

  it("soft-deletes the author's own comment, dated now", () => {
    const question = createComment(db, base.user.id, lessonId, null, "Q?", NOW);

    const deleted = deleteComment(db, question.id, base.user.id, false, LATER);

    expect(deleted).toMatchObject({
      id: question.id,
      body: "Q?",
      deletedAt: LATER.toISOString(),
    });
  });

  it("refuses to delete someone else's comment unless the deleter is staff", () => {
    const question = createComment(db, base.user.id, lessonId, null, "Q?", NOW);

    expect(() =>
      deleteComment(db, question.id, base.instructor.id, false, LATER)
    ).toThrow("You can only delete your own comments");

    const deleted = deleteComment(db, question.id, base.instructor.id, true, LATER);
    expect(deleted.deletedAt).toBe(LATER.toISOString());
  });

  it("leaves an already-deleted comment as it was", () => {
    const question = createComment(db, base.user.id, lessonId, null, "Q?", NOW);
    deleteComment(db, question.id, base.user.id, false, NOW);

    const again = deleteComment(db, question.id, base.user.id, false, LATER);

    expect(again.deletedAt).toBe(NOW.toISOString());
  });

  it("refuses to delete a comment that doesn't exist", () => {
    expect(() => deleteComment(db, 9999, base.user.id, true, LATER)).toThrow(
      "Comment not found"
    );
  });
});
