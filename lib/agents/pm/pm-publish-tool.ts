import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgentAction } from "@/lib/agents/agent-types";
import type { ArtifactType } from "@/lib/integrations/storage/artifact-store";
import { getArtifactStore } from "@/lib/integrations/storage/artifact-store-factory";
import { artifactOwnershipMetadata } from "@/lib/integrations/storage/artifact-access";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import { ensurePMRun, writePMRun } from "./pm-result-store";
import type { PMArtifactType, PMResult } from "./pm-types";
import { loadDtaConfig } from "@/lib/config/env";

export const PUBLISH_PM_RESULT_TOOL_NAME = "publish_pm_result";

const PMArtifactTypeSchema = Type.Union([
  Type.Literal("URD"),
  Type.Literal("PRD"),
  Type.Literal("USER_STORY"),
  Type.Literal("ACCEPTANCE_CRITERIA"),
  Type.Literal("DESIGN"),
  Type.Literal("TASK_PLAN"),
]);

const AgentActionSchema = Type.Object({
  type: Type.Union([Type.Literal("handoff"), Type.Literal("workflow"), Type.Literal("notification")]),
  target: Type.Optional(Type.String({ maxLength: 500 })),
  payload: Type.Optional(Type.Unknown()),
  reason: Type.Optional(Type.String({ maxLength: 2_000 })),
});

const PublishPMResultParams = Type.Object({
  requirementSummary: Type.String({ minLength: 1, maxLength: 50_000 }),
  artifacts: Type.Array(Type.Object({
    type: PMArtifactTypeSchema,
    title: Type.String({ minLength: 1, maxLength: 500 }),
    content: Type.String({ minLength: 1, maxLength: 300_000 }),
  }), { minItems: 1, maxItems: 50 }),
  recommendedActions: Type.Optional(Type.Array(AgentActionSchema, { maxItems: 100 })),
});

const STORAGE_TYPES: Record<PMArtifactType, ArtifactType> = {
  URD: "urd",
  PRD: "prd",
  USER_STORY: "user_story",
  ACCEPTANCE_CRITERIA: "acceptance_criteria",
  DESIGN: "design",
  TASK_PLAN: "task_plan",
};

export function createPublishPMResultTool(
  runId: string,
  scope: Pick<AgentMetadata, "userId" | "projectId" | "conversationId"> = {},
) {
  return defineTool({
    name: PUBLISH_PM_RESULT_TOOL_NAME,
    label: "Publish PM result",
    description: "Publish source-backed PM artifacts and generic recommended actions.",
    promptSnippet: "Publish the final structured PM result and its Markdown artifacts.",
    promptGuidelines: ["Call publish_pm_result exactly once after completing the PM analysis."],
    parameters: PublishPMResultParams,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      const store = getArtifactStore();
      const ownership = artifactOwnershipMetadata({ ...scope, runId });
      const artifacts = await Promise.all(params.artifacts.map(async (artifact) => ({
        definition: artifact,
        reference: await store.put({
          type: STORAGE_TYPES[artifact.type as PMArtifactType],
          title: artifact.title,
          mimeType: "text/markdown; charset=utf-8",
          data: artifact.content,
          metadata: { ...ownership, pmArtifactType: artifact.type },
        }),
      })));
      const actions = (params.recommendedActions ?? []) as AgentAction[];
      const result: PMResult = {
        requirementSummary: params.requirementSummary,
        artifacts: artifacts.map(({ definition, reference }) => ({
          type: definition.type as PMArtifactType,
          artifactId: reference.id,
          title: reference.title,
        })),
        ...(actions.length ? { recommendedActions: actions } : {}),
      };
      const current = ensurePMRun(runId, undefined, scope);
      const revision = current.revision + 1;
      const reviewRequired = loadDtaConfig().pmReviewRequired;
      const publishedAt = new Date().toISOString();
      writePMRun({
        ...current,
        status: "completed",
        result,
        artifacts: [...current.artifacts, ...artifacts.map(({ reference }) => reference)],
        actions,
        reviewStatus: reviewRequired ? "needs_review" : "approved",
        revision,
        reviewHistory: reviewRequired ? current.reviewHistory : [...current.reviewHistory, {
          status: "approved",
          actorId: "dta-policy",
          comment: "Automatically approved by DTA_PM_REVIEW_REQUIRED=false",
          reviewedAt: publishedAt,
          revision,
        }],
        updatedAt: publishedAt,
      });
      return {
        content: [{ type: "text", text: "PM result published successfully." }],
        details: { runId, artifacts: artifacts.map(({ reference }) => reference), actions },
      };
    },
  });
}
