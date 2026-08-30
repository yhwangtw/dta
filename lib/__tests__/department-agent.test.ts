import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseAgentManifest } from "../agents/agent-manifest";
import { createPublishDepartmentResultTool } from "../agents/department/department-publish-tool";
import { DepartmentReviewValidationError, readDepartmentRun, reviewDepartmentRun } from "../agents/department/department-result-store";

function definition() {
  return parseAgentManifest({
    version: 2,
    agents: [{
      id: "knowledge-agent",
      displayName: "Knowledge Agent",
      description: "Creates governed knowledge briefs.",
      systemPrompt: "Create a source-backed brief.",
      enabledByDefault: true,
      outputSchema: {
        type: "object",
        required: ["brief", "sources"],
        properties: { brief: { type: "string" }, sources: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
      artifactTypes: ["KNOWLEDGE_BRIEF"],
      reviewPolicy: "required",
    }],
  })[0];
}

describe("generic Department Agent result", () => {
  it("validates manifest output, persists documents, and gates review", async () => {
    const runId = randomUUID();
    const agent = definition();
    const metadata = { agentType: "department" as const, agentId: agent.id, displayName: agent.displayName, runId, userId: "local-user" };
    const tool = createPublishDepartmentResultTool(runId, metadata, agent);
    await expect(tool.execute("invalid", {
      result: { brief: "Missing sources" },
      documents: [],
    }, undefined, undefined, {} as never)).rejects.toThrow(/outputSchema/);

    await tool.execute("valid", {
      result: { brief: "Pilot knowledge", sources: ["meeting-1"] },
      documents: [{ type: "KNOWLEDGE_BRIEF", title: "Pilot brief", content: "# Pilot\n\nSource-backed." }],
      actions: [{ type: "notification", target: "knowledge-owner", reason: "Ready for review" }],
    }, undefined, undefined, {} as never);

    expect(readDepartmentRun(runId)).toMatchObject({
      agentId: "knowledge-agent",
      status: "completed",
      reviewStatus: "needs_review",
      revision: 1,
      result: { brief: "Pilot knowledge", sources: ["meeting-1"] },
      actions: [{ type: "notification", target: "knowledge-owner" }],
    });
    expect(() => reviewDepartmentRun({ runId, decision: "changes_requested", actorId: "reviewer" })).toThrow(DepartmentReviewValidationError);
    expect(reviewDepartmentRun({ runId, decision: "approved", actorId: "reviewer" })).toMatchObject({ reviewStatus: "approved" });
  });
});
