import { describe, it, expect } from "vitest";
import { LessonProgressStatus } from "~/db/schema";
import { addStudent, setUpCourse, watch } from "./fixtures";

function visit(
  fixture: ReturnType<typeof setUpCourse>,
  userId: number,
  lessonIndex: 0 | 1 | 2
) {
  return fixture.viewer.recordLessonVisit({
    userId,
    courseId: fixture.base.course.id,
    lesson: fixture.lessons[lessonIndex],
  });
}

describe("visiting a lesson", () => {
  it("marks the lesson in progress on the first visit", () => {
    const fixture = setUpCourse();
    const student = fixture.base.user.id;

    const progress = visit(fixture, student, 1);

    expect(progress.lessonStatus).toBe(LessonProgressStatus.InProgress);
    expect(progress.lessonProgressMap).toEqual({
      [fixture.lessons[1].id]: LessonProgressStatus.InProgress,
    });
  });

  it("keeps a completed lesson completed when it is visited again", () => {
    const fixture = setUpCourse();
    const student = fixture.base.user.id;
    visit(fixture, student, 1);
    fixture.viewer.markLessonComplete(student, fixture.lessons[1].id);

    expect(visit(fixture, student, 1).lessonStatus).toBe(
      LessonProgressStatus.Completed
    );
  });

  it("shows the status of every lesson in the course, for this person only", () => {
    const fixture = setUpCourse();
    const student = fixture.base.user.id;
    const other = addStudent(fixture.db, "Other").id;
    fixture.viewer.markLessonComplete(student, fixture.lessons[0].id);
    visit(fixture, other, 2);

    expect(visit(fixture, student, 1).lessonProgressMap).toEqual({
      [fixture.lessons[0].id]: LessonProgressStatus.Completed,
      [fixture.lessons[1].id]: LessonProgressStatus.InProgress,
    });
  });

  it("completes a lesson that was never visited", () => {
    const fixture = setUpCourse();
    const student = fixture.base.user.id;

    const row = fixture.viewer.markLessonComplete(
      student,
      fixture.lessons[2].id
    );

    expect(row.status).toBe(LessonProgressStatus.Completed);
    expect(row.completedAt).not.toBeNull();
  });
});

describe("where the person is in the video", () => {
  it("resumes from the last position and reports the furthest point reached", () => {
    const fixture = setUpCourse();
    const student = fixture.base.user.id;
    const lessonId = fixture.lessons[0].id;
    watch(fixture.db, {
      userId: student,
      lessonId,
      positionSeconds: 300,
      createdAt: "2026-11-01T09:00:00.000Z",
    });
    watch(fixture.db, {
      userId: student,
      lessonId,
      positionSeconds: 120,
      createdAt: "2026-11-01T09:05:00.000Z",
    });

    const progress = visit(fixture, student, 0);

    expect(progress.lastWatchPosition).toBe(120);
    // 300 of the ten-minute (600 s) video.
    expect(progress.watchProgress).toBe(50);
  });

  it("caps watch progress at 100%", () => {
    const fixture = setUpCourse();
    const student = fixture.base.user.id;
    const lessonId = fixture.lessons[0].id;
    watch(fixture.db, { userId: student, lessonId, positionSeconds: 900 });

    expect(visit(fixture, student, 0).watchProgress).toBe(100);
  });

  it("starts at zero before the person has watched anything", () => {
    const fixture = setUpCourse();

    expect(visit(fixture, fixture.base.user.id, 0)).toMatchObject({
      lastWatchPosition: 0,
      watchProgress: 0,
    });
  });

  it("ignores watch events on a lesson without a video", () => {
    const fixture = setUpCourse();
    const student = fixture.base.user.id;
    const lessonId = fixture.lessons[1].id;
    watch(fixture.db, { userId: student, lessonId, positionSeconds: 300 });

    expect(visit(fixture, student, 1)).toMatchObject({
      lastWatchPosition: 0,
      watchProgress: 0,
    });
  });
});
