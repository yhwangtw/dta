import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPublishPMResultTool } from "../agents/pm/pm-publish-tool";
import { PMReviewValidationError, readPMRun, reviewPMRun } from "../agents/pm/pm-result-store";

describe("publish_pm_result", () => {
  it("persists PM documents, structured references, and generic actions", async () => {
    const runId = randomUUID();
    const tool = createPublishPMResultTool(runId);
    await tool.execute("call-pm", {
      requirementSummary: "Create an auditable pilot workflow.",
      artifacts: [
        { type: "URD", title: "Pilot URD", content: "# URD\n\n## User need\nAuditable pilot." },
        { type: "PRD", title: "Pilot PRD", content: "# PRD\n\n## Scope\nPilot workflow." },
        { type: "USER_STORY", title: "Pilot stories", content: "# User stories\n\nAs a reviewer…" },
        { type: "ACCEPTANCE_CRITERIA", title: "Pilot acceptance", content: "# Acceptance criteria\n\n- Evidence is retained." },
        { type: "DESIGN", title: "Pilot design context", content: "# Design context\n\nHuman approval gate." },
        { type: "TASK_PLAN", title: "Pilot task plan", content: "# Task plan\n\n1. Implement audit log." },
      ],
      recommendedActions: [{ type: "workflow", target: "pm-create-jira-epic", reason: "Approved plan can be scheduled" }],
    }, undefined, undefined, {} as never);

    const stored = readPMRun(runId);
    expect(stored).toMatchObject({
      status: "completed",
      reviewStatus: "needs_review",
      revision: 1,
      result: { requirementSummary: "Create an auditable pilot workflow." },
      actions: [{ type: "workflow", target: "pm-create-jira-epic" }],
    });
    expect(stored?.result?.artifacts.map((artifact) => artifact.type)).toEqual([
      "URD", "PRD", "USER_STORY", "ACCEPTANCE_CRITERIA", "DESIGN", "TASK_PLAN",
    ]);
    expect(stored?.artifacts).toHaveLength(6);
    expect(() => reviewPMRun({ runId, decision: "rejected", actorId: "reviewer" })).toThrow(PMReviewValidationError);
    expect(reviewPMRun({ runId, decision: "approved", actorId: "reviewer" })).toMatchObject({
      reviewStatus: "approved",
      reviewHistory: [expect.objectContaining({ actorId: "reviewer", status: "approved", revision: 1 })],
    });
  });
});
