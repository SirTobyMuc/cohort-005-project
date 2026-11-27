import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftState = {
  length: number;
  maxLength: number;
  tooLong: boolean;
  /** The draft differs from what is saved. */
  dirty: boolean;
  /** The server rejects an empty note, so Save stays off rather than fail. */
  canSave: boolean;
};

export function noteDraftState(
  draft: string,
  savedBody: string | null
): NoteDraftState {
  const length = draft.length;
  const tooLong = length > MAX_NOTE_LENGTH;
  const dirty = draft !== (savedBody ?? "");
  const empty = draft.trim().length === 0;

  return {
    length,
    maxLength: MAX_NOTE_LENGTH,
    tooLong,
    dirty,
    canSave: dirty && !empty && !tooLong,
  };
}
