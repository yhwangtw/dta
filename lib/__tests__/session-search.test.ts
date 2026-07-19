import { describe, expect, it } from "vitest";
import { searchSessionEntries } from "../session-search";

describe("searchSessionEntries", () => {
  it("finds user and assistant text without opening or mutating a session", () => {
    const entries = Object.freeze([
      Object.freeze({
        type: "message",
        id: "user-1",
        message: Object.freeze({ role: "user", content: "Please split the God class" }),
      }),
      Object.freeze({
        type: "message",
        id: "assistant-1",
        message: Object.freeze({
          role: "assistant",
          content: Object.freeze([
            Object.freeze({ type: "text", text: "Start with the UserService God class." }),
            Object.freeze({ type: "toolCall", name: "read" }),
          ]),
        }),
      }),
      Object.freeze({
        type: "message",
        id: "tool-1",
        message: Object.freeze({ role: "toolResult", content: "God class" }),
      }),
    ]);

    expect(searchSessionEntries(entries, "god class")).toEqual([
      expect.objectContaining({ entryId: "user-1", role: "user", line: 0 }),
      expect.objectContaining({ entryId: "assistant-1", role: "assistant", line: 1 }),
    ]);
  });

  it("caps matches per session at eight", () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({
      type: "message",
      id: `message-${index}`,
      message: { role: "user", content: `needle ${index}` },
    }));

    expect(searchSessionEntries(entries, "needle")).toHaveLength(8);
  });
});
