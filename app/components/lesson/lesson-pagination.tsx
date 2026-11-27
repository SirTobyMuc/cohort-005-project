import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

type LessonLink = { id: number; title: string };

export function LessonPagination({
  courseSlug,
  courseTitle,
  prevLesson,
  nextLesson,
}: {
  courseSlug: string;
  courseTitle: string;
  prevLesson: LessonLink | null;
  nextLesson: LessonLink | null;
}) {
  return (
    <div className="flex items-center justify-between border-t pt-6">
      {prevLesson ? (
        <Link
          to={`/courses/${courseSlug}/lessons/${prevLesson.id}`}
          className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
          <PaginationLabel label="Previous" title={prevLesson.title} />
        </Link>
      ) : (
        <div />
      )}

      {nextLesson ? (
        <Link
          to={`/courses/${courseSlug}/lessons/${nextLesson.id}`}
          className="flex items-center gap-2 text-right text-sm hover:text-foreground text-muted-foreground"
        >
          <PaginationLabel label="Next" title={nextLesson.title} />
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <Link
          to={`/courses/${courseSlug}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <PaginationLabel label="Back to" title={courseTitle} />
          <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

function PaginationLabel({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{title}</div>
    </div>
  );
}
