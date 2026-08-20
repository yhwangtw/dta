import { describe, expect, it } from "vitest";
import { buildMeetingMediaTimeline, formatMediaTimestamp } from "../integrations/media/meeting-timeline";

describe("meeting media timeline", () => {
  it("aligns transcript and visual evidence with readable timestamps", () => {
    const result = buildMeetingMediaTimeline({
      sourceName: "weekly-sync.mp4",
      transcript: {
        text: "Pilot approved",
        language: "zh",
        segments: [{ startSeconds: 61, endSeconds: 65, speaker: "Alex", text: "Pilot approved" }],
      },
      visual: {
        summary: "A rollout slide is shown.",
        observations: [{ timestampSeconds: 63, summary: "Rollout plan slide", visibleText: "Launch Monday" }],
      },
    });
    expect(formatMediaTimestamp(3661)).toBe("01:01:01");
    expect(result).toContain("[01:01–01:05] Alex: Pilot approved");
    expect(result).toContain("[01:03] Rollout plan slide · Visible text: Launch Monday");
  });
});
