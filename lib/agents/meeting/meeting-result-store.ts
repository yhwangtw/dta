import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import {
  isMeetingResult,
  normalizeMeetingResult,
  type MeetingReviewDecision,
  type MeetingReviewEvent,
  type MeetingReviewStatus,
  type StoredMeetingResult,
} from "./meeting-types";

const REVIEW_STATUSES = new Set<MeetingReviewStatus>([
  "draft",
  "needs_review",
  "approved",
  "changes_requested",
  "rejected",
]);
const REVIEW_DECISIONS = new Set<MeetingReviewDecision>([
  "approved",
  "changes_requested",
  "rejected",
]);

export class MeetingRunNotFoundError extends Error {}
export class MeetingReviewConflictError extends Error {}
export class MeetingReviewValidationError extends Error {}

function resultPath(runId: string): string {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(runId)) throw new Error("Invalid meeting run id");
  return join(getDtaDataDir(), "meeting-runs", `${runId}.json`);
}

export function readMeetingRun(runId: string): StoredMeetingResult | null {
  const path = resultPath(runId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredMeetingResult>;
    if (!raw || raw.runId !== runId || !Array.isArray(raw.artifacts)) return null;
    if (raw.status !== "running" && raw.status !== "completed" && raw.status !== "failed") return null;
    const result = raw.result ? normalizeMeetingResult(raw.result, runId) : undefined;
    if (raw.result && (!result || !isMeetingResult(result))) return null;
    const reviewStatus = raw.status === "completed" && REVIEW_STATUSES.has(raw.reviewStatus as MeetingReviewStatus)
      ? raw.reviewStatus as MeetingReviewStatus
      : raw.status === "completed" ? "needs_review" : "draft";
    const revision = Number.isInteger(raw.revision) && Number(raw.revision) >= 0
      ? Number(raw.revision)
      : raw.status === "completed" ? 1 : 0;
    const reviewHistory = Array.isArray(raw.reviewHistory)
      ? raw.reviewHistory.filter(isReviewEvent)
      : [];
    return {
      runId,
      ...(raw.sessionId ? { sessionId: raw.sessionId } : {}),
      ...(typeof raw.userId === "string" ? { userId: raw.userId } : {}),
      ...(typeof raw.projectId === "string" ? { projectId: raw.projectId } : {}),
      ...(typeof raw.conversationId === "string" ? { conversationId: raw.conversationId } : {}),
      status: raw.status,
      ...(result ? { result } : {}),
      artifacts: raw.artifacts,
      actions: Array.isArray(raw.actions) ? raw.actions : [],
      reviewStatus,
      revision,
      reviewHistory,
      ...(raw.error ? { error: raw.error } : {}),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

function isReviewEvent(value: unknown): value is MeetingReviewEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<MeetingReviewEvent>;
  return REVIEW_DECISIONS.has(event.status as MeetingReviewDecision)
    && typeof event.actorId === "string"
    && event.actorId.length > 0
    && typeof event.reviewedAt === "string"
    && Number.isInteger(event.revision)
    && Number(event.revision) >= 1
    && (event.comment === undefined || typeof event.comment === "string");
}

export function writeMeetingRun(run: StoredMeetingResult): void {
  const path = resultPath(run.runId);
  mkdirSync(join(getDtaDataDir(), "meeting-runs"), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(run, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
}

export function ensureMeetingRun(
  runId: string,
  sessionId?: string,
  scope: Pick<AgentMetadata, "userId" | "projectId" | "conversationId"> = {},
): StoredMeetingResult {
  const existing = readMeetingRun(runId);
  if (existing) {
    if (existing.userId && scope.userId && existing.userId !== scope.userId) {
      throw new Error("Meeting run belongs to another user");
    }
    const next = {
      ...existing,
      ...(sessionId ? { sessionId } : {}),
      ...(scope.userId ? { userId: scope.userId } : {}),
      ...(scope.projectId ? { projectId: scope.projectId } : {}),
      ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
      updatedAt: existing.updatedAt,
    };
    if (JSON.stringify(next) !== JSON.stringify(existing)) {
      next.updatedAt = new Date().toISOString();
      writeMeetingRun(next);
      return next;
    }
    return existing;
  }
  const created: StoredMeetingResult = {
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
  writeMeetingRun(created);
  return created;
}

export function failMeetingRun(runId: string, error: string): StoredMeetingResult {
  const current = ensureMeetingRun(runId);
  const failed: StoredMeetingResult = {
    ...current,
    status: "failed",
    reviewStatus: "draft",
    error: error.slice(0, 2_000),
    updatedAt: new Date().toISOString(),
  };
  writeMeetingRun(failed);
  return failed;
}

export function reviewMeetingRun(input: {
  runId: string;
  decision: MeetingReviewDecision;
  actorId: string;
  comment?: string;
}): StoredMeetingResult {
  const current = readMeetingRun(input.runId);
  if (!current) throw new MeetingRunNotFoundError("Meeting run not found");
  if (current.status !== "completed" || !current.result) {
    throw new MeetingReviewConflictError("Meeting result is not ready for review");
  }
  if (!REVIEW_DECISIONS.has(input.decision)) {
    throw new MeetingReviewValidationError("Invalid meeting review decision");
  }
  const actorId = input.actorId.trim().slice(0, 500);
  const comment = input.comment?.trim().slice(0, 5_000);
  if (!actorId) throw new MeetingReviewValidationError("Review actor is required");
  if ((input.decision === "changes_requested" || input.decision === "rejected") && !comment) {
    throw new MeetingReviewValidationError("A comment is required when requesting changes or rejecting a result");
  }
  if (current.reviewStatus !== "needs_review" && current.reviewStatus !== "approved") {
    throw new MeetingReviewConflictError("This revision must be republished before it can be reviewed again");
  }
  if (current.reviewStatus === "approved" && input.decision === "approved") {
    throw new MeetingReviewConflictError("This meeting revision is already approved");
  }
  const reviewedAt = new Date().toISOString();
  const event: MeetingReviewEvent = {
    status: input.decision,
    actorId,
    ...(comment ? { comment } : {}),
    reviewedAt,
    revision: current.revision,
  };
  const reviewed: StoredMeetingResult = {
    ...current,
    reviewStatus: input.decision,
    reviewHistory: [...current.reviewHistory, event],
    updatedAt: reviewedAt,
  };
  writeMeetingRun(reviewed);
  return reviewed;
}

export function listMeetingRuns(limit = 200): StoredMeetingResult[] {
  const directory = join(getDtaDataDir(), "meeting-runs");
  if (!existsSync(directory)) return [];
  const runs: StoredMeetingResult[] = [];
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".json")) continue;
    try {
      const run = readMeetingRun(name.slice(0, -5));
      if (run) runs.push(run);
    } catch {
      // Ignore files that are not DTA-managed meeting run records.
    }
  }
  return runs
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.max(1, Math.min(limit, 10_000)));
}

export function deleteMeetingRun(runId: string): boolean {
  const path = resultPath(runId);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
