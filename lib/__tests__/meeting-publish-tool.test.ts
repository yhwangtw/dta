import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPublishMeetingResultTool } from "../agents/meeting/meeting-publish-tool";
import { readMeetingRun } from "../agents/meeting/meeting-result-store";
import { normalizeMeetingResult } from "../agents/meeting/meeting-types";

describe("publish_meeting_result", () => {
  it("persists validated structured output and review artifacts", async () => {
    const runId = randomUUID();
    const tool = createPublishMeetingResultTool(runId);
    await tool.execute("call-1", {
      result: {
        title: "Weekly sync",
        summary: "The pilot was approved.",
        decisions: [{
          id: "decision_pilot",
          text: "Approve the pilot",
          owner: "Elon",
          evidence: [{ timestamp: "00:12:30", speaker: "Elon", excerpt: "We approve the pilot." }],
          confidence: 0.96,
          needsConfirmation: false,
        }],
        actionItems: [{ title: "Start pilot", owner: "Alex", dueDate: "2026-08-30" }],
        requirements: [{ title: "Audit log", description: "Keep review evidence." }],
      },
      minutesMarkdown: "# Weekly sync\n\n## Decisions\n\nApprove the pilot.",
    }, undefined, undefined, {} as never);

    const stored = readMeetingRun(runId);
    expect(stored).toMatchObject({
      status: "completed",
      reviewStatus: "needs_review",
      revision: 1,
      result: {
        schemaVersion: "2.0",
        title: "Weekly sync",
        decisions: [{ id: "decision_pilot", confidence: 0.96, needsConfirmation: false }],
        actionItems: [{ evidence: [], confidence: 0.25, needsConfirmation: true }],
      },
    });
    expect(stored?.artifacts.map((artifact) => artifact.type)).toEqual(["meeting_result", "meeting_minutes"]);
  });

  it("keeps generated traceability ids stable when unrelated items are inserted", () => {
    const original = normalizeMeetingResult({
      summary: "summary",
      decisions: [{ text: "Approve the pilot" }],
      actionItems: [],
      requirements: [],
    }, "run-stable");
    const revised = normalizeMeetingResult({
      summary: "summary",
      decisions: [{ text: "Discuss budget" }, { text: "Approve the pilot" }],
      actionItems: [],
      requirements: [],
    }, "run-stable");
    expect(revised?.decisions[1].id).toBe(original?.decisions[0].id);
  });
});
