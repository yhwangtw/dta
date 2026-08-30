import type { AgentAction } from "@/lib/agents/agent-types";
import type { ArtifactReference } from "@/lib/integrations/storage/artifact-store";
import type { MeetingReviewEvent, MeetingReviewStatus } from "@/lib/agents/meeting/meeting-types";

export type PMArtifactType =
  | "URD"
  | "PRD"
  | "USER_STORY"
  | "ACCEPTANCE_CRITERIA"
  | "DESIGN"
  | "TASK_PLAN";

export interface PMResult {
  requirementSummary: string;
  artifacts: Array<{
    type: PMArtifactType;
    artifactId: string;
    title: string;
  }>;
  recommendedActions?: AgentAction[];
}

export interface StoredPMResult {
  runId: string;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  conversationId?: string;
  status: "running" | "completed" | "failed";
  result?: PMResult;
  artifacts: ArtifactReference[];
  actions: AgentAction[];
  reviewStatus: MeetingReviewStatus;
  revision: number;
  reviewHistory: MeetingReviewEvent[];
  error?: string;
  updatedAt: string;
}

const PM_ARTIFACT_TYPES = new Set<PMArtifactType>([
  "URD", "PRD", "USER_STORY", "ACCEPTANCE_CRITERIA", "DESIGN", "TASK_PLAN",
]);

export function isPMResult(value: unknown): value is PMResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<PMResult>;
  return typeof result.requirementSummary === "string"
    && Array.isArray(result.artifacts)
    && result.artifacts.every((artifact) => Boolean(artifact)
      && PM_ARTIFACT_TYPES.has(artifact.type)
      && typeof artifact.artifactId === "string"
      && typeof artifact.title === "string")
    && (result.recommendedActions === undefined || Array.isArray(result.recommendedActions));
}
