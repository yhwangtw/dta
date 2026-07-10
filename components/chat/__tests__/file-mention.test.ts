import { describe, it, expect } from "vitest";
import { detectFileMention } from "../ChatInput";

describe("detectFileMention", () => {
  it("detects a bare @ at the start", () => {
    expect(detectFileMention("@", 1)).toEqual({ start: 0, query: "" });
  });

  it("detects @ after whitespace with a partial name", () => {
    expect(detectFileMention("fix @ind", 8)).toEqual({ start: 4, query: "ind" });
  });

  it("carries directory drill-down segments", () => {
    expect(detectFileMention("@src/comp", 9)).toEqual({ start: 0, query: "src/comp" });
  });

  it("does not trigger mid-word (email addresses)", () => {
    expect(detectFileMention("mail me a@b.com", 15)).toBeNull();
  });

  it("ends the mention at whitespace", () => {
    expect(detectFileMention("@src/foo.ts and", 15)).toBeNull();
  });

  it("quoted mentions may contain spaces", () => {
    expect(detectFileMention('@"my dir/fi', 11)).toEqual({ start: 0, query: "my dir/fi" });
  });

  it("a closed quote finishes the mention", () => {
    expect(detectFileMention('@"my dir/file.ts" ', 18)).toBeNull();
  });

  it("only looks before the caret", () => {
    expect(detectFileMention("@src tail", 4)).toEqual({ start: 0, query: "src" });
  });
});
