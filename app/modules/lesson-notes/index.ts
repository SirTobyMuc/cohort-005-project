import { MAX_NOTE_LENGTH } from "~/lib/notes";
import { describeDraft, type NoteDraftStatus } from "./lib/draft";

export type { NoteDraftStatus };

/**
 * What the note editor shows for the text in the box: the character count
 * against the limit, and whether Save does anything. `savedBody` is the note
 * as last saved, or "" when the Student has none yet.
 */
export function noteDraftStatus(
  draft: string,
  savedBody: string
): NoteDraftStatus {
  return describeDraft(draft, savedBody, MAX_NOTE_LENGTH);
}
