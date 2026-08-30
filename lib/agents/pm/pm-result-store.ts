import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import { isPMResult, type StoredPMResult } from "./pm-types";
import type { MeetingReviewDecision } from "@/lib/agents/meeting/meeting-types";

export class PMRunNotFoundError extends Error {}
export class PMReviewConflictError extends Error {}
export class PMReviewValidationError extends Error {}

const REVIEW_DECISIONS = new Set<MeetingReviewDecision>(["approved", "changes_requested", "rejected"]);

function resultPath(runId: string): string {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(runId)) throw new Error("Invalid PM run id");
  return join(getDtaDataDir(), "pm-runs", `${runId}.json`);
}

export function readPMRun(runId: string): StoredPMResult | null {
  const path = resultPath(runId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as StoredPMResult;
    if (!raw || raw.runId !== runId || !Array.isArray(raw.artifacts) || !Array.isArray(raw.actions)) return null;
    if (raw.status !== "running" && raw.status !== "completed" && raw.status !== "failed") return null;
    if (raw.result && !isPMResult(raw.result)) return null;
    return {
      ...raw,
      reviewStatus: raw.reviewStatus ?? (raw.status === "completed" ? "needs_review" : "draft"),
      revision: Number.isInteger(raw.revision) ? raw.revision : raw.result ? 1 : 0,
      reviewHistory: Array.isArray(raw.reviewHistory) ? raw.reviewHistory : [],
    };
  } catch {
    return null;
  }
}

export function writePMRun(run: StoredPMResult): void {
  const path = resultPath(run.runId);
  mkdirSync(join(getDtaDataDir(), "pm-runs"), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(run, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
}

export function ensurePMRun(
  runId: string,
  sessionId?: string,
  scope: Pick<AgentMetadata, "userId" | "projectId" | "conversationId"> = {},
): StoredPMResult {
  const existing = readPMRun(runId);
  if (existing) {
    if (existing.userId && scope.userId && existing.userId !== scope.userId) {
      throw new Error("PM run belongs to another user");
    }
    const updated = {
      ...existing,
      ...(sessionId ? { sessionId } : {}),
      ...(scope.userId ? { userId: scope.userId } : {}),
      ...(scope.projectId ? { projectId: scope.projectId } : {}),
      ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
      updatedAt: existing.updatedAt,
    };
    if (JSON.stringify(updated) !== JSON.stringify(existing)) {
      updated.updatedAt = new Date().toISOString();
      writePMRun(updated);
      return updated;
    }
    return existing;
  }
  const created: StoredPMResult = {
    runId,
    ...(sessionId ? { sessionId } : {}),
    ...(scope.userId ? { userId: scope.userId } : {}),
    ...(scope.projectId ? { projectId: scope.projectId } : {}),
    ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
    status: "running",
    artifacts: [],
    actions: [],
    reviewStatus: "draft",
    revision: 0,
    reviewHistory: [],
    updatedAt: new Date().toISOString(),
  };
  writePMRun(created);
  return created;
}

export function failPMRun(runId: string, error: string): StoredPMResult {
  const failed = { ...ensurePMRun(runId), status: "failed" as const, error: error.slice(0, 2_000), updatedAt: new Date().toISOString() };
  writePMRun(failed);
  return failed;
}

export function reviewPMRun(input: { runId: string; decision: MeetingReviewDecision; actorId: string; comment?: string }): StoredPMResult {
  const current = readPMRun(input.runId);
  if (!current) throw new PMRunNotFoundError("PM run not found");
  if (current.status !== "completed" || !current.result) throw new PMReviewConflictError("Only completed PM results can be reviewed");
  if (!REVIEW_DECISIONS.has(input.decision)) throw new PMReviewValidationError("Invalid PM review decision");
  const actorId = input.actorId.trim().slice(0, 500);
  const comment = input.comment?.trim().slice(0, 5_000);
  if (!actorId) throw new PMReviewValidationError("Review actor is required");
  if ((input.decision === "changes_requested" || input.decision === "rejected") && !comment) {
    throw new PMReviewValidationError("A comment is required when requesting changes or rejecting a result");
  }
  if (current.reviewStatus !== "needs_review" && current.reviewStatus !== "approved") {
    throw new PMReviewConflictError("This revision must be republished before it can be reviewed again");
  }
  if (current.reviewStatus === "approved" && input.decision === "approved") {
    throw new PMReviewConflictError("This PM revision is already approved");
  }
  const reviewedAt = new Date().toISOString();
  const updated: StoredPMResult = {
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
  };
  writePMRun(updated);
  return updated;
}

export function listPMRuns(limit = 200): StoredPMResult[] {
  const directory = join(getDtaDataDir(), "pm-runs");
  if (!existsSync(directory)) return [];
  const runs = readdirSync(directory).flatMap((name) => {
    if (!name.endsWith(".json")) return [];
    try { return readPMRun(name.slice(0, -5)) ?? []; }
    catch { return []; }
  });
  return runs.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.max(1, Math.min(limit, 10_000)));
}

export function deletePMRun(runId: string): boolean {
  const path = resultPath(runId);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
