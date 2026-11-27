import { describe, it, expect } from "vitest";
import * as schema from "~/db/schema";
import { addStudent, postComment, setUpCourse } from "./fixtures";

const AT = (minute: number) =>
  new Date(Date.UTC(2026, 10, 1, 9, minute)).toISOString();

describe("the lesson's discussion", () => {
  it("nests replies under their question, oldest first, and renders the bodies", async () => {
    const { db, viewer, base, lessons } = setUpCourse();
    const lessonId = lessons[0].id;
    const question = postComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Why **strict**?",
      createdAt: AT(1),
    });
    postComment(db, {
      lessonId,
      userId: base.instructor.id,
      body: "It catches bugs.",
      parentId: question.id,
      createdAt: AT(2),
    });

    const thread = await viewer.getRenderedThread(lessonId);

    expect(thread).toHaveLength(1);
    expect(thread[0]).toMatchObject({
      id: question.id,
      deleted: false,
      author: { name: "Test User", isInstructor: false },
    });
    expect(thread[0].bodyHtml).toContain("<strong>strict</strong>");
    expect(thread[0].replies).toHaveLength(1);
    expect(thread[0].replies[0].author.isInstructor).toBe(true);
  });

  it("keeps a deleted question that still has replies, without its body", async () => {
    const { db, viewer, base, lessons } = setUpCourse();
    const lessonId = lessons[0].id;
    const question = postComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Secret",
      createdAt: AT(1),
      deletedAt: AT(5),
    });
    postComment(db, {
      lessonId,
      userId: base.instructor.id,
      body: "Answer",
      parentId: question.id,
      createdAt: AT(2),
    });

    const [shown] = await viewer.getRenderedThread(lessonId);

    expect(shown).toMatchObject({ deleted: true, body: "", bodyHtml: "" });
    expect(shown.replies).toHaveLength(1);
  });

  it("drops a deleted question with no replies left, and deleted replies", async () => {
    const { db, viewer, base, lessons } = setUpCourse();
    const lessonId = lessons[0].id;
    const question = postComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Gone",
      createdAt: AT(1),
      deletedAt: AT(5),
    });
    postComment(db, {
      lessonId,
      userId: base.instructor.id,
      body: "Also gone",
      parentId: question.id,
      createdAt: AT(2),
      deletedAt: AT(6),
    });

    expect(await viewer.getRenderedThread(lessonId)).toEqual([]);
  });

  it("hides a deleted reply under a live question", async () => {
    const { db, viewer, base, lessons } = setUpCourse();
    const lessonId = lessons[0].id;
    const question = postComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Still here",
      createdAt: AT(1),
    });
    postComment(db, {
      lessonId,
      userId: base.instructor.id,
      body: "Retracted",
      parentId: question.id,
      createdAt: AT(2),
      deletedAt: AT(3),
    });

    const [shown] = await viewer.getRenderedThread(lessonId);

    expect(shown.deleted).toBe(false);
    expect(shown.replies).toEqual([]);
  });

  it("marks a Platform Admin's comment, and nobody else's", async () => {
    const { db, viewer, base, lessons } = setUpCourse();
    const lessonId = lessons[0].id;
    const admin = db
      .insert(schema.users)
      .values({
        name: "Admin",
        email: "admin@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();
    postComment(db, {
      lessonId,
      userId: admin.id,
      body: "Admin here",
      createdAt: AT(1),
    });
    postComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Student here",
      createdAt: AT(2),
    });

    const thread = await viewer.getRenderedThread(lessonId);

    expect(thread.map((c) => c.author.isPlatformAdmin)).toEqual([true, false]);
  });

  it("shows only this lesson's comments, and finds one by id", async () => {
    const { db, viewer, lessons } = setUpCourse();
    const student = addStudent(db, "Ada").id;
    const elsewhere = postComment(db, {
      lessonId: lessons[1].id,
      userId: student,
      body: "Other lesson",
      createdAt: AT(1),
    });

    expect(await viewer.getRenderedThread(lessons[0].id)).toEqual([]);
    expect(viewer.getComment(elsewhere.id)?.lessonId).toBe(lessons[1].id);
  });

  it("has no thread for a lesson that does not exist", async () => {
    const { viewer } = setUpCourse();
    expect(await viewer.getRenderedThread(9999)).toEqual([]);
  });
});
