import type { AgentRun } from "@/lib/agent-run-types";
import { readAgentRunStore } from "@/lib/agent-run-store";
import { AuthenticationError, assertRunAccess, type RequestPrincipal } from "@/lib/auth/request-auth";
import { agentRunStatusToA2ATaskState, runToA2ATask } from "./a2a-adapter";
import type { A2AListTasksResponse, A2ATask, A2ATaskState } from "./a2a-types";

const TASK_STATES = new Set<A2ATaskState>([
  "TASK_STATE_SUBMITTED",
  "TASK_STATE_WORKING",
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_REJECTED",
  "TASK_STATE_INPUT_REQUIRED",
  "TASK_STATE_AUTH_REQUIRED",
]);

interface TaskCursor {
  timestamp: string;
  id: string;
}

export class A2AListTasksValidationError extends Error {}

function taskTimestamp(run: AgentRun): string {
  return run.finishedAt ?? run.startedAt ?? run.createdAt;
}

function integerParameter(params: URLSearchParams, name: string, fallback: number, minimum: number, maximum?: number): number {
  const raw = params.get(name);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) throw new A2AListTasksValidationError(`${name} must be an integer`);
  const parsed = Number.parseInt(raw, 10);
  if (parsed < minimum || (maximum !== undefined && parsed > maximum)) {
    throw new A2AListTasksValidationError(`${name} must be between ${minimum} and ${maximum ?? "the supported maximum"}`);
  }
  return parsed;
}

function booleanParameter(params: URLSearchParams, name: string): boolean {
  const raw = params.get(name);
  if (raw === null) return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new A2AListTasksValidationError(`${name} must be true or false`);
}

function decodeCursor(value: string): TaskCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<TaskCursor>;
    if (typeof parsed.timestamp !== "string" || !Number.isFinite(Date.parse(parsed.timestamp)) || typeof parsed.id !== "string" || !parsed.id) {
      throw new Error("invalid cursor");
    }
    return { timestamp: parsed.timestamp, id: parsed.id };
  } catch {
    throw new A2AListTasksValidationError("pageToken is invalid or expired");
  }
}

function encodeCursor(run: AgentRun): string {
  return Buffer.from(JSON.stringify({ timestamp: taskTimestamp(run), id: run.id })).toString("base64url");
}

function compareRuns(left: AgentRun, right: AgentRun): number {
  const time = Date.parse(taskTimestamp(right)) - Date.parse(taskTimestamp(left));
  return time || right.id.localeCompare(left.id);
}

function followsCursor(run: AgentRun, cursor: TaskCursor): boolean {
  const runTime = Date.parse(taskTimestamp(run));
  const cursorTime = Date.parse(cursor.timestamp);
  return runTime < cursorTime || (runTime === cursorTime && run.id.localeCompare(cursor.id) < 0);
}

function isVisible(principal: RequestPrincipal, run: AgentRun): boolean {
  if (!run.agentMetadata || run.agentMetadata.agentType === "coding") return false;
  try {
    assertRunAccess(principal, run.agentMetadata.userId);
    return true;
  } catch (error) {
    if (error instanceof AuthenticationError) return false;
    throw error;
  }
}

function taskForList(run: AgentRun, includeArtifacts: boolean): A2ATask {
  const task = runToA2ATask(run);
  if (includeArtifacts) return { ...task, artifacts: task.artifacts ?? [] };
  const { artifacts: _artifacts, ...withoutArtifacts } = task;
  return withoutArtifacts;
}

export function listA2ATasks(
  params: URLSearchParams,
  principal: RequestPrincipal,
  sourceRuns: AgentRun[] = readAgentRunStore().runs,
): A2AListTasksResponse {
  const pageSize = integerParameter(params, "pageSize", 50, 1, 100);
  integerParameter(params, "historyLength", 0, 0);
  const includeArtifacts = booleanParameter(params, "includeArtifacts");
  const contextId = params.get("contextId");
  const requestedState = params.get("status");
  if (requestedState !== null && !TASK_STATES.has(requestedState as A2ATaskState)) {
    throw new A2AListTasksValidationError(`status is not a supported A2A task state: ${requestedState}`);
  }
  const timestampAfterRaw = params.get("statusTimestampAfter");
  const timestampAfter = timestampAfterRaw === null ? null : Date.parse(timestampAfterRaw);
  if (timestampAfterRaw !== null && !Number.isFinite(timestampAfter)) {
    throw new A2AListTasksValidationError("statusTimestampAfter must be an ISO 8601 timestamp");
  }
  const cursor = decodeCursor(params.get("pageToken") ?? "");

  const matching = sourceRuns
    .filter((run) => isVisible(principal, run))
    .filter((run) => contextId === null || (run.agentMetadata?.conversationId ?? run.id) === contextId)
    .filter((run) => requestedState === null || agentRunStatusToA2ATaskState(run.status) === requestedState)
    .filter((run) => timestampAfter === null || Date.parse(taskTimestamp(run)) >= timestampAfter)
    .sort(compareRuns);
  const candidates = cursor ? matching.filter((run) => followsCursor(run, cursor)) : matching;
  const page = candidates.slice(0, pageSize);
  const hasMore = candidates.length > page.length;

  return {
    tasks: page.map((run) => taskForList(run, includeArtifacts)),
    nextPageToken: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : "",
    pageSize,
    totalSize: matching.length,
  };
}
