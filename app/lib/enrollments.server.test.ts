import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { enrollUser } from "./enrollments.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function enrollmentsOf(userId: number) {
  return db
    .select()
    .from(schema.enrollments)
    .all()
    .filter((e) => e.userId === userId);
}

describe("enrollUser", () => {
  it("enrolls a Student on the course for an Individual Purchase", () => {
    const enrollment = enrollUser(db, base.user.id, base.course.id, NOW);

    expect(enrollment).toMatchObject({
      userId: base.user.id,
      courseId: base.course.id,
      enrolledAt: NOW.toISOString(),
    });
    expect(enrollmentsOf(base.user.id)).toHaveLength(1);
  });

  it("refuses a second Enrollment on the same course", () => {
    enrollUser(db, base.user.id, base.course.id, NOW);

    expect(() => enrollUser(db, base.user.id, base.course.id, NOW)).toThrow(
      "already enrolled"
    );
    expect(enrollmentsOf(base.user.id)).toHaveLength(1);
  });

  it("enrolls a Lapsed Student again", () => {
    const first = enrollUser(db, base.user.id, base.course.id, NOW);
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

    const again = enrollUser(db, base.user.id, base.course.id, NOW);

    expect(again.id).not.toBe(first.id);
    expect(enrollmentsOf(base.user.id)).toEqual([again]);
  });
});
