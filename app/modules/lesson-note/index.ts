import { noteDraftState, type NoteDraftState } from "./lib/draft";

export type { NoteDraftState };

/**
 * What the lesson note editor shows for a draft: the character count, whether
 * there are unsaved changes, and whether Save is allowed.
 */
export function describeNoteDraft(
  draft: string,
  savedBody: string | null
): NoteDraftState {
  return noteDraftState(draft, savedBody);
}
