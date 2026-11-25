import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraft = {
  /** "120 / 2000", the same shape as the comment form's counter. */
  counter: string;
  tooLong: boolean;
  canSave: boolean;
};

export function describeDraft(body: string): NoteDraft {
  const tooLong = body.length > MAX_NOTE_LENGTH;
  const empty = body.trim().length === 0;
  return {
    counter: `${body.length} / ${MAX_NOTE_LENGTH}`,
    tooLong,
    canSave: !empty && !tooLong,
  };
}
