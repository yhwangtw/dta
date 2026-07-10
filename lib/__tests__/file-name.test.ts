import { describe, it, expect } from "vitest";
import { validateEntryName } from "../file-name";

describe("validateEntryName", () => {
  it("accepts normal names", () => {
    expect(validateEntryName("notes.md")).toBeNull();
    expect(validateEntryName("我的筆記.txt")).toBeNull();
    expect(validateEntryName(".env.local")).toBeNull();
    expect(validateEntryName("src")).toBeNull();
  });

  it("rejects separators and traversal", () => {
    expect(validateEntryName("a/b")).not.toBeNull();
    expect(validateEntryName("a\\b")).not.toBeNull();
    expect(validateEntryName("..")).not.toBeNull();
    expect(validateEntryName(".")).not.toBeNull();
  });

  it("rejects empty and control characters", () => {
    expect(validateEntryName("")).not.toBeNull();
    expect(validateEntryName("   ")).not.toBeNull();
    expect(validateEntryName("a\0b")).not.toBeNull();
    expect(validateEntryName("a<b>")).not.toBeNull();
  });

  it("rejects overlong names", () => {
    expect(validateEntryName("x".repeat(256))).not.toBeNull();
  });
});
