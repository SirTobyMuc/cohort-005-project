import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("reports the length against the note limit", () => {
    const state = describeNoteDraft("hello", null);
    expect(state.length).toBe(5);
    expect(state.maxLength).toBe(MAX_NOTE_LENGTH);
  });

  it("does not allow saving an untouched empty note", () => {
    expect(describeNoteDraft("", null)).toMatchObject({
      dirty: false,
      canSave: false,
    });
  });

  it("allows saving a new note", () => {
    expect(describeNoteDraft("Remember Result<T>", null)).toMatchObject({
      dirty: true,
      canSave: true,
    });
  });

  it("is clean when the draft matches the saved note", () => {
    expect(describeNoteDraft("saved", "saved")).toMatchObject({
      dirty: false,
      canSave: false,
    });
  });

  it("allows saving an edit to a saved note", () => {
    expect(describeNoteDraft("saved, then edited", "saved")).toMatchObject({
      dirty: true,
      canSave: true,
    });
  });

  it("does not allow saving whitespace only", () => {
    expect(describeNoteDraft("   \n", "saved")).toMatchObject({
      dirty: true,
      canSave: false,
    });
  });

  it("accepts a note exactly at the limit", () => {
    expect(describeNoteDraft("a".repeat(MAX_NOTE_LENGTH), null)).toMatchObject({
      tooLong: false,
      canSave: true,
    });
  });

  it("refuses a note over the limit", () => {
    expect(
      describeNoteDraft("a".repeat(MAX_NOTE_LENGTH + 1), null)
    ).toMatchObject({ tooLong: true, canSave: false });
  });
});
