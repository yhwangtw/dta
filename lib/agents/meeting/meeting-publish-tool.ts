import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getArtifactStore } from "@/lib/integrations/storage/artifact-store-factory";
import { artifactOwnershipMetadata } from "@/lib/integrations/storage/artifact-access";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import { loadDtaConfig } from "@/lib/config/env";
import { ensureMeetingRun, writeMeetingRun } from "./meeting-result-store";
import { normalizeMeetingResult } from "./meeting-types";

export const PUBLISH_MEETING_RESULT_TOOL_NAME = "publish_meeting_result";

const Owner = Type.Optional(Type.String({ maxLength: 500 }));
const Evidence = Type.Array(Type.Object({
  artifactId: Type.Optional(Type.String({ maxLength: 200 })),
  source: Type.Optional(Type.String({ maxLength: 500 })),
  timestamp: Type.Optional(Type.String({ maxLength: 100 })),
  excerpt: Type.Optional(Type.String({ maxLength: 2_000 })),
  speaker: Type.Optional(Type.String({ maxLength: 500 })),
}), { maxItems: 50 });
const Traceability = {
  id: Type.Optional(Type.String({ maxLength: 200 })),
  evidence: Type.Optional(Evidence),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  needsConfirmation: Type.Optional(Type.Boolean()),
};
const MeetingResultSchema = Type.Object({
  schemaVersion: Type.Optional(Type.Literal("2.0")),
  title: Type.Optional(Type.String({ maxLength: 500 })),
  summary: Type.String({ minLength: 1, maxLength: 50_000 }),
  transcriptArtifactId: Type.Optional(Type.String({ maxLength: 200 })),
  decisions: Type.Array(Type.Object({
    text: Type.String({ minLength: 1, maxLength: 10_000 }),
    owner: Owner,
    ...Traceability,
  }), { maxItems: 500 }),
  actionItems: Type.Array(Type.Object({
    title: Type.String({ minLength: 1, maxLength: 2_000 }),
    description: Type.Optional(Type.String({ maxLength: 10_000 })),
    owner: Owner,
    dueDate: Type.Optional(Type.String({ maxLength: 100 })),
    ...Traceability,
  }), { maxItems: 500 }),
  requirements: Type.Array(Type.Object({
    title: Type.String({ minLength: 1, maxLength: 2_000 }),
    description: Type.String({ minLength: 1, maxLength: 20_000 }),
    ...Traceability,
  }), { maxItems: 500 }),
});

const PublishMeetingResultParams = Type.Object({
  result: MeetingResultSchema,
  minutesMarkdown: Type.String({ minLength: 1, maxLength: 300_000 }),
});

export function createPublishMeetingResultTool(
  runId: string,
  scope: Pick<AgentMetadata, "userId" | "projectId" | "conversationId"> = {},
) {
  return defineTool({
    name: PUBLISH_MEETING_RESULT_TOOL_NAME,
    label: "Publish meeting result",
    description: "Validate and publish the final structured meeting result and review-ready minutes.",
    promptSnippet: "Publish the final structured meeting result and Markdown minutes.",
    promptGuidelines: ["Call publish_meeting_result exactly once after completing the meeting analysis."],
    parameters: PublishMeetingResultParams,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      const store = getArtifactStore();
      const ownership = artifactOwnershipMetadata({ ...scope, runId });
      const result = normalizeMeetingResult(params.result, runId);
      if (!result) throw new Error("MeetingResult is invalid");
      const transcriptArtifact = result.transcriptArtifactId
        ? await store.get(result.transcriptArtifactId)
        : null;
      if (transcriptArtifact && transcriptArtifact.type !== "transcript") {
        throw new Error("transcriptArtifactId does not reference a transcript artifact");
      }
      if (transcriptArtifact && scope.userId && artifactOwnershipMetadata(transcriptArtifact.metadata).userId !== scope.userId) {
        throw new Error("transcriptArtifactId is not owned by this Meeting Agent run");
      }
      const evidenceArtifactIds = new Set([
        ...result.decisions.flatMap((entry) => entry.evidence.map((evidence) => evidence.artifactId)),
        ...result.actionItems.flatMap((entry) => entry.evidence.map((evidence) => evidence.artifactId)),
        ...result.requirements.flatMap((entry) => entry.evidence.map((evidence) => evidence.artifactId)),
      ].filter((id): id is string => Boolean(id)));
      for (const artifactId of evidenceArtifactIds) {
        const artifact = await store.get(artifactId);
        const artifactOwner = artifactOwnershipMetadata(artifact.metadata).userId;
        if (scope.userId && artifactOwner !== scope.userId) {
          throw new Error(`Evidence artifact ${artifactId} is not owned by this Meeting Agent user`);
        }
      }
      const [jsonArtifact, markdownArtifact] = await Promise.all([
        store.put({
          type: "meeting_result",
          title: result.title ? `${result.title} — structured result` : "Meeting structured result",
          mimeType: "application/json",
          data: `${JSON.stringify(result, null, 2)}\n`,
          metadata: { ...ownership },
        }),
        store.put({
          type: "meeting_minutes",
          title: result.title ? `${result.title} — minutes` : "Meeting minutes",
          mimeType: "text/markdown; charset=utf-8",
          data: params.minutesMarkdown,
          metadata: { ...ownership },
        }),
      ]);
      const current = ensureMeetingRun(runId, undefined, scope);
      const revision = current.revision + 1;
      const reviewRequired = loadDtaConfig().meetingReviewRequired;
      const publishedAt = new Date().toISOString();
      const actions = result.requirements.length > 0 ? [{
        type: "handoff" as const,
        target: "pm-agent",
        reason: "Product requirements were identified in the meeting",
        payload: {
          sourceMeetingRunId: runId,
          meetingTitle: result.title,
          requirements: result.requirements,
        },
      }] : [];
      writeMeetingRun({
        ...current,
        status: "completed",
        reviewStatus: reviewRequired ? "needs_review" : "approved",
        revision,
        reviewHistory: reviewRequired ? current.reviewHistory : [...current.reviewHistory, {
          status: "approved",
          actorId: "dta-policy",
          comment: "Automatically approved by DTA_MEETING_REVIEW_REQUIRED=false",
          reviewedAt: publishedAt,
          revision,
        }],
        result,
        artifacts: [
          ...current.artifacts,
          ...(transcriptArtifact ? [{
            id: transcriptArtifact.id,
            type: transcriptArtifact.type,
            title: transcriptArtifact.title,
            mimeType: transcriptArtifact.mimeType,
            size: transcriptArtifact.size,
            createdAt: transcriptArtifact.createdAt,
          }] : []),
          jsonArtifact,
          markdownArtifact,
        ],
        actions,
        updatedAt: publishedAt,
      });
      return {
        content: [{ type: "text", text: "Meeting result published successfully." }],
        details: { runId, artifacts: [jsonArtifact, markdownArtifact], actions },
      };
    },
  });
}
