import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { describeNoteDraft } from "~/modules/note-draft";

/**
 * The Student's private note on a lesson. Its card, header and Save row
 * follow the Questions & Discussion card further down the page, so the two
 * read as one family of panels.
 */
export function LessonNote({
  note,
}: {
  note: { body: string; updatedAt: string } | null;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [body, setBody] = useState(note?.body ?? "");
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1">
          <NotebookPen className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Your notes</h2>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" />
            Only you can see these
          </span>
        </div>

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Jot down what you want to remember from this lesson..."
            aria-label="Your notes"
            className="resize-y"
          />

          <NoteSaveRow
            isSaving={isSaving}
            error={error}
            updatedAt={note?.updatedAt}
            body={body}
          />
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteSaveRow({
  isSaving,
  error,
  updatedAt,
  body,
}: {
  isSaving: boolean;
  error: string | undefined;
  updatedAt: string | undefined;
  body: string;
}) {
  const draft = describeNoteDraft(body);

  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="sm" disabled={isSaving || !draft.canSave}>
        {isSaving ? "Saving..." : "Save note"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
      {!error && updatedAt && (
        <span
          suppressHydrationWarning
          className="text-xs text-muted-foreground"
        >
          Last edited {formatRelativeTime(updatedAt)}
        </span>
      )}
      <span
        className={cn(
          "ml-auto text-xs",
          draft.tooLong ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {draft.counter}
      </span>
    </div>
  );
}
