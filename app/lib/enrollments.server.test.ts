import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { enrollUser } from "./enrollments.server";
import { fakeNotifications } from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let notifications: ReturnType<typeof fakeNotifications>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  notifications = fakeNotifications();
});

function enroll(userId: number, courseId: number) {
  return enrollUser(db, userId, courseId, NOW, notifications);
}

function enrollmentsOf(userId: number) {
  return db
    .select()
    .from(schema.enrollments)
    .all()
    .filter((e) => e.userId === userId);
}

describe("enrollUser", () => {
  it("enrolls a Student on the course for an Individual Purchase", async () => {
    const enrollment = await enroll(base.user.id, base.course.id);

    expect(enrollment).toMatchObject({
      userId: base.user.id,
      courseId: base.course.id,
      enrolledAt: NOW.toISOString(),
    });
    expect(enrollmentsOf(base.user.id)).toHaveLength(1);
  });

  it("refuses a second Enrollment on the same course", async () => {
    await enroll(base.user.id, base.course.id);

    await expect(enroll(base.user.id, base.course.id)).rejects.toThrow(
      "already enrolled"
    );
    expect(enrollmentsOf(base.user.id)).toHaveLength(1);
  });

  it("enrolls a Lapsed Student again", async () => {
    const first = await enroll(base.user.id, base.course.id);
    const module = db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "Basics", position: 1 })
      .returning()
      .get();
    const lesson = db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
      .returning()
      .get();
    db.insert(schema.lessonProgress)
      .values({
        userId: base.user.id,
        lessonId: lesson.id,
        status: schema.LessonProgressStatus.Completed,
      })
      .run();
    // Losing the Enrollment (e.g. an approved refund) leaves the progress.
    db.delete(schema.enrollments).run();

    const again = await enroll(base.user.id, base.course.id);

    expect(again.id).not.toBe(first.id);
    expect(enrollmentsOf(base.user.id)).toEqual([again]);
  });
});

describe("New Enrollment Notification", () => {
  it("tells the course's Instructor about a new Enrollment, from the Student", async () => {
    const enrollment = await enroll(base.user.id, base.course.id);

    expect(notifications.triggers).toEqual([
      {
        kind: "new_enrollment",
        recipients: [
          {
            id: base.instructor.id,
            name: "Test Instructor",
            email: "instructor@example.com",
            avatar: null,
          },
        ],
        sender: {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
          avatar: null,
        },
        data: {
          enrollmentId: enrollment.id,
          courseTitle: "Test Course",
          url: `/instructor/${base.course.id}/students`,
        },
        idempotencyKey: `enrollment:${enrollment.id}`,
      },
    ]);
  });

  it("tells the Instructor again when a Lapsed Student enrolls again", async () => {
    const first = await enroll(base.user.id, base.course.id);
    db.delete(schema.enrollments).run();

    const again = await enroll(base.user.id, base.course.id);

    expect(notifications.triggers.map((t) => t.idempotencyKey)).toEqual([
      `enrollment:${first.id}`,
      `enrollment:${again.id}`,
    ]);
  });

  it("still enrolls the Student when the Notification fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = {
      async trigger() {
        throw new Error("down");
      },
    };

    const enrollment = await enrollUser(
      db,
      base.user.id,
      base.course.id,
      NOW,
      failing
    );

    expect(enrollmentsOf(base.user.id)).toEqual([enrollment]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
