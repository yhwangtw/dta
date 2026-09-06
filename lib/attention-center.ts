import { readAgentRunStore } from "./agent-run-store";
import { listMeetingRuns } from "./agents/meeting/meeting-result-store";
import { readScheduleStore } from "./schedule-store";
import { listAllSessions, readSessionFile } from "./session-reader";
import type { AssistantMessage } from "./types";
import type { AgentRun } from "./agent-run-types";
import type { ScheduleRun } from "./schedule-types";
import type { SessionInfo } from "./types";
import type { StoredMeetingResult } from "./agents/meeting/meeting-types";
import { assertRunAccess, type RequestPrincipal } from "./auth/request-auth";
import { accessibleSessionIds } from "./auth/session-access";
import { redactSensitiveText } from "./redaction";

export type AttentionSource = "meeting" | "agent" | "schedule" | "session";
export type AttentionSeverity = "warning" | "error" | "success";

export interface AttentionItem {
  id: string;
  source: AttentionSource;
  severity: AttentionSeverity;
  status: "waiting_for_input" | "failed" | "interrupted" | "completed";
  title: string;
  summary: string;
  occurredAt: string;
  cwd?: string;
  sessionId?: string;
}

export interface AttentionResponse {
  items: AttentionItem[];
  serverTime: string;
  userScope: string;
}

const SESSION_ERROR_AGE_MS = 14 * 24 * 60 * 60 * 1_000;
const RECENT_COMPLETION_AGE_MS = 24 * 60 * 60 * 1_000;
const SESSION_SCAN_LIMIT = 60;

function assistantErrorFromSession(path: string): { message: string; at?: string } | null {
  const { entries } = readSessionFile(path);
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const message = entry.message as AssistantMessage;
    if (message.stopReason !== "error") return null;
    return {
      message: message.errorMessage?.trim() || "Model call failed",
      at: entry.timestamp,
    };
  }
  return null;
}

/**
 * Build the durable, cross-surface inbox from persisted run/session stores.
 * Read state intentionally stays client-local: one browser acknowledging an
 * item should not hide it for another device that has not seen it yet.
 */
export function buildAttentionItems(input: {
  agentRuns: AgentRun[];
  scheduleRuns: ScheduleRun[];
  sessions: SessionInfo[];
  meetingRuns?: StoredMeetingResult[];
}, now = new Date()): AttentionItem[] {
  const items: AttentionItem[] = [];
  const representedSessions = new Set<string>();
  const recentCompletionCutoff = now.getTime() - RECENT_COMPLETION_AGE_MS;

  for (const run of input.meetingRuns ?? []) {
    const awaitsReview = run.status === "completed"
      && (run.reviewStatus === "needs_review" || run.reviewStatus === "changes_requested");
    if (run.status !== "failed" && !awaitsReview) continue;
    if (run.sessionId) representedSessions.add(run.sessionId);
    items.push({
      id: `meeting:${run.runId}:${run.status === "failed" ? "failed" : run.reviewStatus}`,
      source: "meeting",
      severity: "warning",
      status: run.status === "failed" ? "failed" : "waiting_for_input",
      title: run.result?.title || "Meeting result needs review",
      summary: redactSensitiveText(run.status === "failed"
        ? run.error?.trim() || "The meeting conversation ended without a reviewable result"
        : run.reviewStatus === "changes_requested"
          ? run.reviewHistory.at(-1)?.comment || "Changes were requested before this meeting can be approved"
          : "Review the source evidence and approve or return this meeting result"),
      occurredAt: run.updatedAt,
      sessionId: run.sessionId,
    });
  }

  for (const run of input.agentRuns) {
    const occurredAt = run.finishedAt ?? run.startedAt ?? run.createdAt;
    const needsAttention = run.status === "waiting_for_input" || run.status === "failed" || run.status === "interrupted";
    const recentCompletion = run.status === "completed" && Date.parse(occurredAt) >= recentCompletionCutoff;
    if (!needsAttention && !recentCompletion) continue;
    if (run.sessionId && representedSessions.has(run.sessionId)) continue;
    if (run.sessionId) representedSessions.add(run.sessionId);
    const status: AttentionItem["status"] = run.status === "waiting_for_input"
      ? "waiting_for_input"
      : run.status === "failed"
        ? "failed"
        : run.status === "completed"
          ? "completed"
          : "interrupted";
    items.push({
      id: `agent:${run.id}:${run.status}`,
      source: "agent",
      severity: run.status === "waiting_for_input" ? "warning" : run.status === "completed" ? "success" : "error",
      status,
      title: run.name,
      summary: redactSensitiveText(run.status === "waiting_for_input"
        ? "The agent is waiting for your decision"
        : run.status === "completed"
          ? run.report?.summary?.trim() || "The agent run completed"
          : run.error?.trim() || "The agent run did not complete"),
      occurredAt,
      cwd: run.cwd,
      sessionId: run.sessionId,
    });
  }

  for (const run of input.scheduleRuns) {
    const occurredAt = run.finishedAt ?? run.startedAt;
    const needsAttention = run.status === "waiting_for_input" || run.status === "failed" || run.status === "skipped";
    const recentCompletion = run.status === "completed" && Date.parse(occurredAt) >= recentCompletionCutoff;
    if (!needsAttention && !recentCompletion) continue;
    if (run.sessionId) representedSessions.add(run.sessionId);
    items.push({
      id: `schedule:${run.id}:${run.status}`,
      source: "schedule",
      severity: run.status === "waiting_for_input" ? "warning" : run.status === "completed" ? "success" : "error",
      status: run.status === "waiting_for_input" ? "waiting_for_input" : run.status === "completed" ? "completed" : "failed",
      title: run.scheduleName,
      summary: redactSensitiveText(run.status === "waiting_for_input"
        ? "The scheduled agent is waiting for your decision"
        : run.status === "completed"
          ? "The scheduled run completed"
          : run.error?.trim() || (run.status === "skipped" ? "The scheduled run was skipped" : "The scheduled run failed")),
      occurredAt,
      sessionId: run.sessionId,
    });
  }

  const minimumModified = now.getTime() - SESSION_ERROR_AGE_MS;
  const sessions = input.sessions
    .filter((session) => Date.parse(session.modified) >= minimumModified)
    .slice(0, SESSION_SCAN_LIMIT);
  for (const session of sessions) {
    if (representedSessions.has(session.id)) continue;
    const error = assistantErrorFromSession(session.path);
    if (!error) continue;
    items.push({
      id: `session:${session.id}:${error.at ?? session.modified}`,
      source: "session",
      severity: "error",
      status: "failed",
      title: session.name || session.firstMessage || "Session failed",
      summary: redactSensitiveText(error.message),
      occurredAt: error.at ?? session.modified,
      cwd: session.cwd,
      sessionId: session.id,
    });
  }

  return items.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
}

export async function collectAttentionItems(principal: RequestPrincipal, now = new Date()): Promise<AttentionItem[]> {
  const [sessions, agentStore, scheduleStore, meetingRuns] = await Promise.all([
    listAllSessions(),
    Promise.resolve(readAgentRunStore()),
    Promise.resolve(readScheduleStore()),
    Promise.resolve(listMeetingRuns()),
  ]);
  const sessionIds = accessibleSessionIds(principal);
  const owned = (ownerId?: string) => {
    try { assertRunAccess(principal, ownerId); return true; } catch { return false; }
  };
  return buildAttentionItems({
    meetingRuns: meetingRuns.filter((run) => owned(run.userId)),
    agentRuns: agentStore.runs.filter((run) => owned(run.agentMetadata?.userId)),
    scheduleRuns: scheduleStore.runs.filter((run) => owned(run.ownerId)),
    sessions: sessions.filter((session) => !sessionIds || sessionIds.has(session.id)),
  }, now);
}
