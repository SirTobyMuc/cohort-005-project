import type { Db } from "./db.server";
import { eq, or } from "drizzle-orm";
import { categories, courses, lessons, modules, users } from "~/db/schema";

const courseDetailColumns = {
  id: courses.id,
  title: courses.title,
  slug: courses.slug,
  description: courses.description,
  salesCopy: courses.salesCopy,
  instructorId: courses.instructorId,
  categoryId: courses.categoryId,
  status: courses.status,
  coverImageUrl: courses.coverImageUrl,
  price: courses.price,
  pppEnabled: courses.pppEnabled,
  createdAt: courses.createdAt,
  updatedAt: courses.updatedAt,
  instructorName: users.name,
  instructorAvatarUrl: users.avatarUrl,
  instructorBio: users.bio,
  categoryName: categories.name,
};

export function getCourseWithDetails(db: Db, id: number) {
  const course = db
    .select(courseDetailColumns)
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .innerJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(courses.id, id))
    .get();

  if (!course) return null;

  const courseModules = db
    .select()
    .from(modules)
    .where(eq(modules.courseId, id))
    .orderBy(modules.position)
    .all();

  const moduleIds = courseModules.map((m) => m.id);

  const courseLessons =
    moduleIds.length > 0
      ? db
          .select()
          .from(lessons)
          .where(or(...moduleIds.map((mid) => eq(lessons.moduleId, mid))))
          .orderBy(lessons.position)
          .all()
      : [];

  return {
    ...course,
    modules: courseModules.map((mod) => ({
      ...mod,
      lessons: courseLessons.filter((l) => l.moduleId === mod.id),
    })),
  };
}

export function getLessonById(db: Db, id: number) {
  return db.select().from(lessons).where(eq(lessons.id, id)).get();
}

export function getModuleById(db: Db, id: number) {
  return db.select().from(modules).where(eq(modules.id, id)).get();
}

export function getUserById(db: Db, id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export type FlatLesson = {
  id: number;
  title: string;
  moduleId: number;
  moduleTitle: string;
};

export function flattenCourseLessons(course: {
  modules: Array<{
    id: number;
    title: string;
    lessons: Array<{ id: number; title: string; moduleId: number }>;
  }>;
}): FlatLesson[] {
  const flat: FlatLesson[] = [];
  for (const mod of course.modules) {
    for (const lesson of mod.lessons) {
      flat.push({
        id: lesson.id,
        title: lesson.title,
        moduleId: mod.id,
        moduleTitle: mod.title,
      });
    }
  }
  return flat;
}

type CourseOutline = Parameters<typeof flattenCourseLessons>[0];

export function buildCurriculum(course: CourseOutline) {
  return course.modules.map((m) => ({
    id: m.id,
    title: m.title,
    lessons: m.lessons.map((l) => ({
      id: l.id,
      title: l.title,
    })),
  }));
}

export function findAdjacentLessons(course: CourseOutline, lessonId: number) {
  const allLessons = flattenCourseLessons(course);
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;
  return { prevLesson, nextLesson };
}
