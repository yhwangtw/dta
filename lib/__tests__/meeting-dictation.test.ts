import { describe, expect, it } from "vitest";
import { appendMeetingDictation } from "../meeting-dictation";

describe("appendMeetingDictation", () => {
  it("adds final speech as a readable source line", () => {
    expect(appendMeetingDictation("第一段內容", "第二段內容", 100)).toEqual({
      text: "第一段內容\n第二段內容",
      accepted: true,
    });
  });

  it("does not partially append speech beyond the source limit", () => {
    expect(appendMeetingDictation("12345", "67890", 8)).toEqual({
      text: "12345",
      accepted: false,
    });
  });
});
