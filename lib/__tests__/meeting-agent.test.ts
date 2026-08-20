import { describe, expect, it } from "vitest";
import { buildMeetingMinutesPrompt } from "../meeting-agent";

describe("Meeting Agent prompt contract", () => {
  it("grounds the minutes in supplied source and preserves missing metadata", () => {
    const prompt = buildMeetingMinutesPrompt({
      title: "Weekly transformation sync",
      date: "2026-08-19",
      participants: "Elon, Alex",
      objective: "Confirm rollout owners",
      source: "[00:04] Alex: Elon owns the pilot and will report back Friday.",
      outputLanguage: "zh-TW",
    });

    expect(prompt).toContain("Digital Transformation Agent's Meeting Intelligence specialist");
    expect(prompt).toContain("Output language: 台灣繁體中文");
    expect(prompt).toContain("Weekly transformation sync");
    expect(prompt).toContain("Action items");
    expect(prompt).toContain("Human review required");
    expect(prompt).toContain("[00:04] Alex");
  });

  it("does not invite the model to infer absent owners or dates", () => {
    const prompt = buildMeetingMinutesPrompt({ source: "A proposal was discussed.", outputLanguage: "en" });

    expect(prompt).toContain("Not provided; do not infer");
    expect(prompt).toContain("Do not invent decisions, owners, dates, commitments, or consensus");
    expect(prompt).toContain("Not specified / 未指定");
  });

  it("labels uploaded files as separate untrusted sources", () => {
    const prompt = buildMeetingMinutesPrompt({
      source: "Facilitator notes",
      attachments: [{ name: "weekly-sync.vtt", content: "[00:05] Alex owns the pilot." }],
      outputLanguage: "en",
    });

    expect(prompt).toContain("SOURCE: PASTED MEETING MATERIAL");
    expect(prompt).toContain("SOURCE FILE: weekly-sync.vtt");
    expect(prompt).toContain("[00:05] Alex owns the pilot");
  });
});
