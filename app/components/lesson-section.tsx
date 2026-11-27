import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "~/components/ui/card";

/**
 * The card that frames a Student's own space under a lesson: their notes and
 * the discussion. Both use it so they read as parts of one page.
 */
export function LessonSection({
  icon: Icon,
  title,
  description,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="mb-8 gap-0 p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{title}</h2>
            {badge}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}
