import type { AgentRun } from "@/lib/agent-run-types";
import type { AgentAction } from "./agent-types";
import type { ArtifactReference } from "@/lib/integrations/storage/artifact-store";
import { readMeetingRun } from "./meeting/meeting-result-store";
import type { MeetingReviewStatus } from "./meeting/meeting-types";

export interface AgentRequest {
  requestId: string;
  userId?: string;
  conversationId?: string;
  projectId?: string;
  task: string;
  input?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export type AgentResponseStatus = "running" | "completed" | "waiting_for_input" | "failed";

export interface AgentResponse {
  requestId: string;
  runId: string;
  agentId: string;
  status: AgentResponseStatus;
  result?: unknown;
  artifacts?: ArtifactReference[];
  actions?: AgentAction[];
  review?: { status: MeetingReviewStatus; revision: number };
  error?: { code: string; message: string };
}

export function reviewForAgentRun(run: AgentRun): AgentResponse["review"] {
  if (run.agentMetadata?.agentType !== "meeting" || !run.agentMetadata.runId) return undefined;
  const meeting = readMeetingRun(run.agentMetadata.runId);
  return meeting ? { status: meeting.reviewStatus, revision: meeting.revision } : undefined;
}

export function releasedActionsForAgentRun(run: AgentRun): AgentAction[] | undefined {
  if (!run.actions?.length) return undefined;
  const review = reviewForAgentRun(run);
  return review && review.status !== "approved" ? undefined : run.actions;
}

export class AgentRequestValidationError extends Error {}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AgentRequestValidationError(`${field} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new AgentRequestValidationError(`${field} is too long`);
  return normalized;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, field, 500);
}

function optionalObject(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentRequestValidationError(`${field} must be a JSON object`);
  }
  if (JSON.stringify(value).length > 1_000_000) {
    throw new AgentRequestValidationError(`${field} is too large`);
  }
  return value as Record<string, unknown>;
}

export function parseAgentRequest(value: unknown): AgentRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentRequestValidationError("JSON object is required");
  }
  const input = value as Record<string, unknown>;
  const userId = optionalString(input.userId, "userId");
  const conversationId = optionalString(input.conversationId, "conversationId");
  const projectId = optionalString(input.projectId, "projectId");
  const requestInput = optionalObject(input.input, "input");
  const context = optionalObject(input.context, "context");
  return {
    requestId: requiredString(input.requestId, "requestId", 200),
    task: requiredString(input.task, "task", 200_000),
    ...(userId ? { userId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(requestInput ? { input: requestInput } : {}),
    ...(context ? { context } : {}),
  };
}

export function responseStatusForRun(run: AgentRun): AgentResponseStatus {
  if (run.status === "completed") return "completed";
  if (run.status === "waiting_for_input") return "waiting_for_input";
  if (run.status === "failed" || run.status === "cancelled" || run.status === "interrupted") return "failed";
  return "running";
}

export function toAgentResponse(run: AgentRun): AgentResponse {
  const status = responseStatusForRun(run);
  const requestId = run.requestId ?? run.id;
  const agentId = run.agentMetadata?.agentId ?? "coding-agent";
  const review = reviewForAgentRun(run);
  const actions = releasedActionsForAgentRun(run);
  return {
    requestId,
    runId: run.id,
    agentId,
    status,
    ...(run.result !== undefined ? { result: run.result } : {}),
    ...(run.artifacts?.length ? { artifacts: run.artifacts } : {}),
    ...(actions?.length ? { actions } : {}),
    ...(review ? { review } : {}),
    ...(status === "failed" ? {
      error: {
        code: run.status === "cancelled" ? "RUN_CANCELLED" : run.status === "interrupted" ? "RUN_INTERRUPTED" : "RUN_FAILED",
        message: run.error || "Agent run failed",
      },
    } : {}),
  };
}
