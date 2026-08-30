import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";
import type { AgentAction } from "@/lib/agents/agent-types";
import type { ArtifactReference } from "@/lib/integrations/storage/artifact-store";
import type { MeetingReviewDecision, MeetingReviewEvent, MeetingReviewStatus } from "@/lib/agents/meeting/meeting-types";

export interface StoredDepartmentResult {
  runId: string;
  agentId: string;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  conversationId?: string;
  status: "running" | "completed" | "failed";
  result?: unknown;
  artifacts: ArtifactReference[];
  actions: AgentAction[];
  reviewStatus: MeetingReviewStatus;
  revision: number;
  reviewHistory: MeetingReviewEvent[];
  error?: string;
  updatedAt: string;
}

export class DepartmentRunNotFoundError extends Error {}
export class DepartmentReviewConflictError extends Error {}
export class DepartmentReviewValidationError extends Error {}

const REVIEW_DECISIONS = new Set<MeetingReviewDecision>(["approved", "changes_requested", "rejected"]);

function pathFor(runId: string): string {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(runId)) throw new DepartmentRunNotFoundError("Department Agent run not found");
  return join(getDtaDataDir(), "department-runs", `${runId}.json`);
}

export function readDepartmentRun(runId: string): StoredDepartmentResult | null {
  const path = pathFor(runId);
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as StoredDepartmentResult;
    if (!value || value.runId !== runId || value.status === undefined || !Array.isArray(value.artifacts) || !Array.isArray(value.actions)) return null;
    if (!Array.isArray(value.reviewHistory) || typeof value.revision !== "number" || typeof value.agentId !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

export function writeDepartmentRun(run: StoredDepartmentResult): StoredDepartmentResult {
  const path = pathFor(run.runId);
  mkdirSync(join(getDtaDataDir(), "department-runs"), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(run, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
  return structuredClone(run);
}

export function ensureDepartmentRun(input: {
  runId: string;
  agentId: string;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  conversationId?: string;
}): StoredDepartmentResult {
  const existing = readDepartmentRun(input.runId);
  if (existing) {
    if (existing.agentId !== input.agentId) throw new Error("Department Agent run type changed");
    if (existing.userId && input.userId && existing.userId !== input.userId) throw new Error("Department Agent run belongs to another user");
    return existing;
  }
  return writeDepartmentRun({
    ...input,
    status: "running",
    artifacts: [],
    actions: [],
    reviewStatus: "draft",
    revision: 0,
    reviewHistory: [],
    updatedAt: new Date().toISOString(),
  });
}

export function failDepartmentRun(input: { runId: string; agentId: string; userId?: string }, error: string): StoredDepartmentResult {
  const current = ensureDepartmentRun(input);
  return writeDepartmentRun({
    ...current,
    status: "failed",
    error: error.slice(0, 2_000),
    updatedAt: new Date().toISOString(),
  });
}

export function reviewDepartmentRun(input: { runId: string; decision: MeetingReviewDecision; actorId: string; comment?: string }): StoredDepartmentResult {
  const current = readDepartmentRun(input.runId);
  if (!current) throw new DepartmentRunNotFoundError("Department Agent run not found");
  if (current.status !== "completed" || current.result === undefined) throw new DepartmentReviewConflictError("Only completed Department Agent results can be reviewed");
  if (!REVIEW_DECISIONS.has(input.decision)) throw new DepartmentReviewValidationError("Invalid Department Agent review decision");
  const actorId = input.actorId.trim().slice(0, 500);
  const comment = input.comment?.trim().slice(0, 5_000);
  if (!actorId) throw new DepartmentReviewValidationError("Review actor is required");
  if ((input.decision === "changes_requested" || input.decision === "rejected") && !comment) {
    throw new DepartmentReviewValidationError("A comment is required when requesting changes or rejecting a result");
  }
  if (current.reviewStatus !== "needs_review" && current.reviewStatus !== "approved") {
    throw new DepartmentReviewConflictError("This revision must be republished before it can be reviewed again");
  }
  if (current.reviewStatus === "approved" && input.decision === "approved") {
    throw new DepartmentReviewConflictError("This Department Agent revision is already approved");
  }
  const reviewedAt = new Date().toISOString();
  return writeDepartmentRun({
    ...current,
    reviewStatus: input.decision,
    reviewHistory: [...current.reviewHistory, {
      status: input.decision,
      actorId,
      ...(comment ? { comment } : {}),
      reviewedAt,
      revision: current.revision,
    }],
    updatedAt: reviewedAt,
  });
}

export function listDepartmentRuns(limit = 200): StoredDepartmentResult[] {
  const directory = join(getDtaDataDir(), "department-runs");
  if (!existsSync(directory)) return [];
  const runs = readdirSync(directory).flatMap((name) => {
    if (!name.endsWith(".json")) return [];
    try { return readDepartmentRun(name.slice(0, -5)) ?? []; }
    catch { return []; }
  });
  return runs.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.max(1, Math.min(limit, 10_000)));
}

export function deleteDepartmentRun(runId: string): boolean {
  const path = pathFor(runId);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
