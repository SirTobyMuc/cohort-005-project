export type NoteDraftStatus = {
  length: number;
  maxLength: number;
  tooLong: boolean;
  empty: boolean;
  unchanged: boolean;
  canSave: boolean;
};

export function describeDraft(
  draft: string,
  savedBody: string,
  maxLength: number
): NoteDraftStatus {
  // The save action trims before it checks or stores, so judge the draft as
  // it will be stored.
  const trimmed = draft.trim();
  const length = trimmed.length;
  const tooLong = length > maxLength;
  const empty = length === 0;
  const unchanged = trimmed === savedBody;

  return {
    length,
    maxLength,
    tooLong,
    empty,
    unchanged,
    canSave: !tooLong && !empty && !unchanged,
  };
}
