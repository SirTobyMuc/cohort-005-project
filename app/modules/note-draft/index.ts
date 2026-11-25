import { describeDraft as describe, type NoteDraft } from "./lib/draft";

export type { NoteDraft };

/**
 * What the lesson note editor shows under the text box while the Student
 * types: the character counter, whether it is over the limit, and whether
 * Save is allowed. Save is held back for the same drafts the save-note
 * action would reject, so the Student finds out before posting.
 */
export function describeNoteDraft(body: string): NoteDraft {
  return describe(body);
}
