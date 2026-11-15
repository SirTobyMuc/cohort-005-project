import { describe, it, expect, beforeEach } from "vitest";
import { fakeNotifications } from "~/lib/notifications.server";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment, deleteComment } from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;
let notifications: ReturnType<typeof fakeNotifications>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  notifications = fakeNotifications();

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
  it("posts a Discussion Question with a trimmed body, dated now", async () => {
    const question = await createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "  How do closures work?  ",
      NOW,
      notifications
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

  it("posts a Reply under a Discussion Question", async () => {
    const question = await createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Q?",
      NOW,
      notifications
    );

    const reply = await createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "Answer",
      NOW,
      notifications
    );

    expect(reply).toMatchObject({
      userId: base.instructor.id,
      lessonId,
      parentId: question.id,
      body: "Answer",
    });
  });

  it("refuses a Reply to a Reply", async () => {
    const question = await createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Q?",
      NOW,
      notifications
    );
    const reply = await createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "A",
      NOW,
      notifications
    );

    await expect(
      createComment(
        db,
        base.user.id,
        lessonId,
        reply.id,
        "Nested",
        NOW,
        notifications
      )
    ).rejects.toThrow("Replies can only be one level deep");
  });

  it("refuses a Reply to a question on a different lesson", async () => {
    const question = await createComment(
      db,
      base.user.id,
      otherLessonId,
      null,
      "Q?",
      NOW,
      notifications
    );

    await expect(
      createComment(
        db,
        base.instructor.id,
        lessonId,
        question.id,
        "A",
        NOW,
        notifications
      )
    ).rejects.toThrow("Parent comment belongs to a different lesson");
  });

  it("refuses a Reply to a comment that doesn't exist", async () => {
    await expect(
      createComment(db, base.user.id, lessonId, 9999, "A", NOW, notifications)
    ).rejects.toThrow("Parent comment not found");
  });

  it("refuses a comment on a lesson that doesn't exist", async () => {
    await expect(
      createComment(db, base.user.id, 9999, null, "Q?", NOW, notifications)
    ).rejects.toThrow("Lesson not found");
  });

  it("refuses an empty or over-long body", async () => {
    await expect(
      createComment(db, base.user.id, lessonId, null, "   ", NOW, notifications)
    ).rejects.toThrow("Comment cannot be empty");
    await expect(
      createComment(
        db,
        base.user.id,
        lessonId,
        null,
        "x".repeat(5001),
        NOW,
        notifications
      )
    ).rejects.toThrow("Comment must be 5000 characters or fewer");
  });
});

describe("deleteComment", () => {
  const LATER = new Date(2026, 9, 7, 9, 0, 0);

  it("soft-deletes the author's own comment, dated now", async () => {
    const question = await createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Q?",
      NOW,
      notifications
    );

    const deleted = await deleteComment(
      db,
      question.id,
      base.user.id,
      false,
      LATER,
      notifications
    );

    expect(deleted).toMatchObject({
      id: question.id,
      body: "Q?",
      deletedAt: LATER.toISOString(),
    });
  });

  it("refuses to delete someone else's comment unless the deleter is staff", async () => {
    const question = await createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Q?",
      NOW,
      notifications
    );

    await expect(
      deleteComment(
        db,
        question.id,
        base.instructor.id,
        false,
        LATER,
        notifications
      )
    ).rejects.toThrow("You can only delete your own comments");

    const deleted = await deleteComment(
      db,
      question.id,
      base.instructor.id,
      true,
      LATER,
      notifications
    );
    expect(deleted.deletedAt).toBe(LATER.toISOString());
  });

  it("leaves an already-deleted comment as it was", async () => {
    const question = await createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Q?",
      NOW,
      notifications
    );
    await deleteComment(
      db,
      question.id,
      base.user.id,
      false,
      NOW,
      notifications
    );

    const again = await deleteComment(
      db,
      question.id,
      base.user.id,
      false,
      LATER,
      notifications
    );

    expect(again.deletedAt).toBe(NOW.toISOString());
  });

  it("refuses to delete a comment that doesn't exist", async () => {
    await expect(
      deleteComment(db, 9999, base.user.id, true, LATER, notifications)
    ).rejects.toThrow("Comment not found");
  });
});

describe("Discussion Notifications", () => {
  function asNotificationUser(user: typeof base.user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatarUrl,
    };
  }

  it("tells the Instructor about a Discussion Question from a student", async () => {
    const question = await createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW,
      notifications
    );

    expect(notifications.triggers).toEqual([
      {
        kind: "discussion_question",
        recipients: [asNotificationUser(base.instructor)],
        sender: asNotificationUser(base.user),
        data: {
          commentId: question.id,
          courseTitle: "Test Course",
          lessonTitle: "Lesson 1",
          snippet: "How do closures work?",
          url: `/courses/test-course/lessons/${lessonId}#comment-${question.id}`,
        },
        idempotencyKey: `discussion-question:${question.id}`,
      },
    ]);
  });

  it("tells the Instructor about a Discussion Question from a Platform Admin", async () => {
    const admin = db
      .insert(schema.users)
      .values({
        name: "Ada Admin",
        email: "ada@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();

    await createComment(db, admin.id, lessonId, null, "Q?", NOW, notifications);

    expect(notifications.triggers).toMatchObject([
      {
        kind: "discussion_question",
        recipients: [asNotificationUser(base.instructor)],
        sender: asNotificationUser(admin),
      },
    ]);
  });

  it("tells nobody when the Instructor posts a top-level comment", async () => {
    await createComment(
      db,
      base.instructor.id,
      lessonId,
      null,
      "Welcome to the lesson!",
      NOW,
      notifications
    );

    expect(notifications.triggers).toEqual([]);
  });
});
