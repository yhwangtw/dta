import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPublishMeetingResultTool } from "../agents/meeting/meeting-publish-tool";
import { readMeetingRun } from "../agents/meeting/meeting-result-store";

describe("publish_meeting_result", () => {
  it("persists validated structured output and review artifacts", async () => {
    const runId = randomUUID();
    const tool = createPublishMeetingResultTool(runId);
    await tool.execute("call-1", {
      result: {
        title: "Weekly sync",
        summary: "The pilot was approved.",
        decisions: [{ text: "Approve the pilot", owner: "Elon" }],
        actionItems: [{ title: "Start pilot", owner: "Alex", dueDate: "2026-08-30" }],
        requirements: [{ title: "Audit log", description: "Keep review evidence." }],
      },
      minutesMarkdown: "# Weekly sync\n\n## Decisions\n\nApprove the pilot.",
    }, undefined, undefined, {} as never);

    const stored = readMeetingRun(runId);
    expect(stored).toMatchObject({ status: "completed", result: { title: "Weekly sync" } });
    expect(stored?.artifacts.map((artifact) => artifact.type)).toEqual(["meeting_result", "meeting_minutes"]);
  });
});
