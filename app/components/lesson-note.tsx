import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { describeNoteDraft, type NoteDraftState } from "~/modules/lesson-note";

// Styled to match the Questions & Discussion card further down the page, so
// the two writing surfaces on a lesson read as one design.
export function LessonNote({
  note,
}: {
  note: { body: string; updatedAt: string } | null;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [draft, setDraft] = useState(note?.body ?? "");
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.data?.error;
  const state = describeNoteDraft(draft, note?.body ?? null);

  return (
    <Card className="mb-8">
      <CardContent className="px-6">
        <LessonNoteHeader />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            rows={4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What do you want to remember from this lesson?"
            aria-label="Your notes"
          />
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || !state.canSave}
            >
              {isSaving ? "Saving..." : "Save note"}
            </Button>
            <SaveStatus
              error={error}
              dirty={state.dirty}
              savedAt={note?.updatedAt}
            />
            <CharacterCount state={state} />
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function LessonNoteHeader() {
  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <NotebookPen className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Your notes</h2>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <Lock className="size-3" />
          Private
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Jot down what you want to remember from this lesson. Only you can see
        these.
      </p>
    </>
  );
}

function SaveStatus({
  error,
  dirty,
  savedAt,
}: {
  error: string | undefined;
  dirty: boolean;
  savedAt: string | undefined;
}) {
  if (error) return <span className="text-sm text-destructive">{error}</span>;
  if (dirty)
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  if (!savedAt) return null;
  return (
    <span suppressHydrationWarning className="text-xs text-muted-foreground">
      Saved {formatRelativeTime(savedAt)}
    </span>
  );
}

function CharacterCount({ state }: { state: NoteDraftState }) {
  return (
    <span
      className={cn(
        "ml-auto text-xs",
        state.tooLong ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {state.length} / {state.maxLength}
    </span>
  );
}
