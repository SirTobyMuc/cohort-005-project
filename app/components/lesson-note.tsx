import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { LessonSection } from "~/components/lesson-section";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { noteDraftStatus, type NoteDraftStatus } from "~/modules/lesson-notes";

export function LessonNote({
  note,
}: {
  note: { body: string; updatedAt: string } | null;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const savedBody = note?.body ?? "";
  const [draft, setDraft] = useState(savedBody);
  const status = noteDraftStatus(draft, savedBody);
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  return (
    <LessonSection
      icon={NotebookPen}
      title="Your notes"
      description="Jot down what you want to remember from this lesson."
      badge={<PrivateBadge />}
    >
      <fetcher.Form method="post" className="space-y-2">
        <input type="hidden" name="intent" value="save-note" />
        <Textarea
          name="body"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder="Key ideas, questions to come back to, a snippet to try…"
          aria-label="Your notes"
          className="min-h-28 resize-y"
        />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="sm"
            disabled={isSaving || !status.canSave}
          >
            {isSaving ? "Saving..." : "Save note"}
          </Button>
          <NoteSaveState
            error={error}
            unchanged={status.unchanged}
            updatedAt={note?.updatedAt}
          />
          <CharacterCount status={status} />
        </div>
      </fetcher.Form>
    </LessonSection>
  );
}

function PrivateBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Lock className="size-3" />
      Only you
    </span>
  );
}

function NoteSaveState({
  error,
  unchanged,
  updatedAt,
}: {
  error: string | undefined;
  unchanged: boolean;
  updatedAt: string | undefined;
}) {
  if (error) return <span className="text-sm text-destructive">{error}</span>;
  if (!unchanged) {
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  }
  if (!updatedAt) return null;
  return (
    <span suppressHydrationWarning className="text-xs text-muted-foreground">
      Saved {formatRelativeTime(updatedAt)}
    </span>
  );
}

function CharacterCount({ status }: { status: NoteDraftStatus }) {
  return (
    <span
      className={cn(
        "ml-auto text-xs",
        status.tooLong ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {status.length} / {status.maxLength}
    </span>
  );
}
