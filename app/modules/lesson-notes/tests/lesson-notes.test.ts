import { describe, it, expect } from "vitest";
import { noteDraftStatus } from "../index";

const LIMIT = 2000;

describe("noteDraftStatus", () => {
  it("lets the Student save a new note", () => {
    expect(noteDraftStatus("Generics infer from arguments", "")).toEqual({
      length: 29,
      maxLength: LIMIT,
      tooLong: false,
      empty: false,
      unchanged: false,
      canSave: true,
    });
  });

  it("does not save an empty box", () => {
    const status = noteDraftStatus("", "");
    expect(status.empty).toBe(true);
    expect(status.canSave).toBe(false);
  });

  it("treats whitespace alone as empty", () => {
    const status = noteDraftStatus("  \n\t ", "old note");
    expect(status.empty).toBe(true);
    expect(status.unchanged).toBe(false);
    expect(status.canSave).toBe(false);
  });

  it("does not save a note that matches the saved one", () => {
    const status = noteDraftStatus("same text", "same text");
    expect(status.unchanged).toBe(true);
    expect(status.canSave).toBe(false);
  });

  it("saves an edit to an existing note", () => {
    const status = noteDraftStatus("same text, edited", "same text");
    expect(status.unchanged).toBe(false);
    expect(status.canSave).toBe(true);
  });

  it("judges the draft as it will be stored, without surrounding whitespace", () => {
    const status = noteDraftStatus("  same text \n", "same text");
    expect(status.length).toBe(9);
    expect(status.unchanged).toBe(true);
    expect(status.canSave).toBe(false);
  });

  it("does not count surrounding whitespace towards the limit", () => {
    const status = noteDraftStatus(` ${"a".repeat(LIMIT)} `, "");
    expect(status.tooLong).toBe(false);
    expect(status.canSave).toBe(true);
  });

  it("accepts a note exactly at the limit", () => {
    const status = noteDraftStatus("a".repeat(LIMIT), "");
    expect(status.length).toBe(LIMIT);
    expect(status.tooLong).toBe(false);
    expect(status.canSave).toBe(true);
  });

  it("refuses a note one character over the limit", () => {
    const status = noteDraftStatus("a".repeat(LIMIT + 1), "");
    expect(status.length).toBe(LIMIT + 1);
    expect(status.tooLong).toBe(true);
    expect(status.canSave).toBe(false);
  });
});
