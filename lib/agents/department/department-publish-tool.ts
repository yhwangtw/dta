import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Check } from "typebox/value";
import type { AgentDefinition } from "@/lib/agents/agent-registry";
import type { AgentAction, AgentMetadata } from "@/lib/agents/agent-types";
import { artifactOwnershipMetadata } from "@/lib/integrations/storage/artifact-access";
import { getArtifactStore } from "@/lib/integrations/storage/artifact-store-factory";
import { ensureDepartmentRun, writeDepartmentRun } from "./department-result-store";

export const PUBLISH_DEPARTMENT_RESULT_TOOL_NAME = "publish_department_result";

const ActionSchema = Type.Object({
  type: Type.Union([Type.Literal("handoff"), Type.Literal("workflow"), Type.Literal("notification")]),
  target: Type.Optional(Type.String({ maxLength: 500 })),
  payload: Type.Optional(Type.Unknown()),
  reason: Type.Optional(Type.String({ maxLength: 2_000 })),
});

const PublishDepartmentResultParams = Type.Object({
  result: Type.Unknown(),
  documents: Type.Optional(Type.Array(Type.Object({
    type: Type.String({ minLength: 1, maxLength: 100 }),
    title: Type.String({ minLength: 1, maxLength: 500 }),
    content: Type.String({ minLength: 1, maxLength: 300_000 }),
    mimeType: Type.Optional(Type.String({ maxLength: 200 })),
  }), { maxItems: 50 })),
  actions: Type.Optional(Type.Array(ActionSchema, { maxItems: 100 })),
});

export function createPublishDepartmentResultTool(
  runId: string,
  metadata: AgentMetadata,
  definition: AgentDefinition,
) {
  if (!definition.outputSchema) throw new Error(`Department Agent ${definition.id} has no output schema`);
  const allowedArtifactTypes = new Set((definition.artifactTypes?.length ? definition.artifactTypes : ["REPORT"]).map((value) => value.toUpperCase()));
  return defineTool({
    name: PUBLISH_DEPARTMENT_RESULT_TOOL_NAME,
    label: "Publish department result",
    description: "Validate and publish this Department Agent's structured result, documents, and recommended actions.",
    promptSnippet: "Publish the final structured result through the governed Department Agent contract.",
    promptGuidelines: ["Call publish_department_result exactly once after completing the requested analysis."],
    parameters: PublishDepartmentResultParams,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      let validResult: boolean;
      try { validResult = Check(definition.outputSchema as never, params.result); }
      catch (error) {
        throw new Error(`Configured outputSchema for ${definition.id} is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!validResult) throw new Error(`Result does not satisfy ${definition.id}'s configured outputSchema`);
      for (const document of params.documents ?? []) {
        if (!allowedArtifactTypes.has(document.type.toUpperCase())) {
          throw new Error(`Document type ${document.type} is not allowed for ${definition.id}`);
        }
      }
      const store = getArtifactStore();
      const ownership = artifactOwnershipMetadata({ ...metadata, runId });
      const resultArtifact = await store.put({
        type: "department_result",
        title: `${definition.displayName} — structured result`,
        mimeType: "application/json",
        data: `${JSON.stringify(params.result, null, 2)}\n`,
        metadata: { ...ownership, agentId: definition.id },
      });
      const documents = await Promise.all((params.documents ?? []).map((document) => store.put({
        type: "department_document",
        title: document.title,
        mimeType: document.mimeType || "text/markdown; charset=utf-8",
        data: document.content,
        metadata: { ...ownership, agentId: definition.id, documentType: document.type },
      })));
      const current = ensureDepartmentRun({
        runId,
        agentId: definition.id,
        ...(metadata.userId ? { userId: metadata.userId } : {}),
        ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
        ...(metadata.conversationId ? { conversationId: metadata.conversationId } : {}),
      });
      const revision = current.revision + 1;
      const publishedAt = new Date().toISOString();
      const reviewRequired = definition.reviewPolicy !== "none";
      const actions = (params.actions ?? []) as AgentAction[];
      writeDepartmentRun({
        ...current,
        status: "completed",
        result: structuredClone(params.result),
        artifacts: [...current.artifacts, resultArtifact, ...documents],
        actions,
        reviewStatus: reviewRequired ? "needs_review" : "approved",
        revision,
        reviewHistory: reviewRequired ? current.reviewHistory : [...current.reviewHistory, {
          status: "approved",
          actorId: "dta-policy",
          comment: "Automatically approved by the Agent manifest reviewPolicy",
          reviewedAt: publishedAt,
          revision,
        }],
        updatedAt: publishedAt,
      });
      return {
        content: [{ type: "text", text: `${definition.displayName} result published successfully.` }],
        details: { runId, artifacts: [resultArtifact, ...documents], actions, reviewRequired },
      };
    },
  });
}
