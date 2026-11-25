import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";

const MAX = 2000;

describe("describeNoteDraft", () => {
  it("counts characters against the note limit", () => {
    expect(
      describeNoteDraft("Generics are like functions for types").counter
    ).toBe(`37 / ${MAX}`);
  });

  it("allows saving a draft with text in it", () => {
    expect(describeNoteDraft("remember: unknown over any")).toMatchObject({
      tooLong: false,
      canSave: true,
    });
  });

  it("holds back an empty draft", () => {
    expect(describeNoteDraft("")).toEqual({
      counter: `0 / ${MAX}`,
      tooLong: false,
      canSave: false,
    });
  });

  it("holds back a draft that is only whitespace", () => {
    expect(describeNoteDraft("  \n\t ").canSave).toBe(false);
  });

  it("allows a draft of exactly the limit", () => {
    expect(describeNoteDraft("a".repeat(MAX))).toEqual({
      counter: `${MAX} / ${MAX}`,
      tooLong: false,
      canSave: true,
    });
  });

  it("flags and holds back a draft one character over the limit", () => {
    expect(describeNoteDraft("a".repeat(MAX + 1))).toEqual({
      counter: `${MAX + 1} / ${MAX}`,
      tooLong: true,
      canSave: false,
    });
  });
});
