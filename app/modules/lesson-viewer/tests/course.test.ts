import { describe, it, expect } from "vitest";
import * as schema from "~/db/schema";
import { markdown } from "~/lib/text";
import { setUpCourse } from "./fixtures";

describe("the course outline", () => {
  it("lists modules and their lessons in position order", () => {
    const { viewer, base, modules, lessons } = setUpCourse();
    const course = viewer.getCourseWithDetails(base.course.id);
    if (!course) throw new Error("course not found");

    expect(viewer.buildCurriculum(course)).toEqual([
      {
        id: modules.basics.id,
        title: "Basics",
        lessons: [
          { id: lessons[0].id, title: "Setup" },
          { id: lessons[1].id, title: "Types" },
        ],
      },
      {
        id: modules.advanced.id,
        title: "Advanced",
        lessons: [{ id: lessons[2].id, title: "Generics" }],
      },
    ]);
  });

  it("carries the instructor and category with the course", () => {
    const { viewer, base } = setUpCourse();

    expect(viewer.getCourseWithDetails(base.course.id)).toMatchObject({
      id: base.course.id,
      slug: "test-course",
      instructorName: "Test Instructor",
      categoryName: "Programming",
    });
  });

  it("finds nothing for an unknown course", () => {
    const { viewer } = setUpCourse();
    expect(viewer.getCourseWithDetails(9999)).toBeNull();
  });

  it("gives an empty outline for a course with no modules", () => {
    const { viewer, db, base } = setUpCourse();
    const other = db
      .insert(schema.courses)
      .values({
        title: "Empty",
        slug: "empty",
        description: "No modules yet",
        salesCopy: markdown(""),
        instructorId: base.instructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Draft,
      })
      .returning()
      .get();

    expect(viewer.getCourseWithDetails(other.id)?.modules).toEqual([]);
  });
});

describe("the lessons either side", () => {
  it("crosses module boundaries", () => {
    const { viewer, base, lessons } = setUpCourse();
    const course = viewer.getCourseWithDetails(base.course.id);
    if (!course) throw new Error("course not found");

    expect(viewer.findAdjacentLessons(course, lessons[1].id)).toEqual({
      prevLesson: {
        id: lessons[0].id,
        title: "Setup",
        moduleId: lessons[0].moduleId,
        moduleTitle: "Basics",
      },
      nextLesson: {
        id: lessons[2].id,
        title: "Generics",
        moduleId: lessons[2].moduleId,
        moduleTitle: "Advanced",
      },
    });
  });

  it("has no previous lesson at the start and no next at the end", () => {
    const { viewer, base, lessons } = setUpCourse();
    const course = viewer.getCourseWithDetails(base.course.id);
    if (!course) throw new Error("course not found");

    expect(viewer.findAdjacentLessons(course, lessons[0].id).prevLesson).toBe(
      null
    );
    expect(viewer.findAdjacentLessons(course, lessons[2].id).nextLesson).toBe(
      null
    );
  });
});

describe("looking things up", () => {
  it("finds a lesson, its module and a user by id", () => {
    const { viewer, base, lessons, modules } = setUpCourse();

    expect(viewer.getLesson(lessons[1].id)?.title).toBe("Types");
    expect(viewer.getModule(modules.advanced.id)?.title).toBe("Advanced");
    expect(viewer.getUser(base.instructor.id)?.name).toBe("Test Instructor");
    expect(viewer.getLesson(9999)).toBeUndefined();
  });
});
