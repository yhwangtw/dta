import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";

export type WorkflowExecutionStatus = "running" | "completed" | "failed";

export interface WorkflowExecutionRecord {
  id: string;
  idempotencyKey: string;
  workflowId: string;
  agentId: string;
  sourceRunId: string;
  actorId: string;
  status: WorkflowExecutionStatus;
  reason: string;
  requestedAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

interface WorkflowExecutionStore {
  version: 1;
  executions: WorkflowExecutionRecord[];
}

const MAX_EXECUTIONS = 1_000;
const MAX_STORED_RESULT_BYTES = 100_000;

function storePath(): string {
  return join(getDtaDataDir(), "workflow-executions.json");
}

function validRecord(value: unknown): value is WorkflowExecutionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<WorkflowExecutionRecord>;
  return typeof item.id === "string"
    && typeof item.idempotencyKey === "string"
    && typeof item.workflowId === "string"
    && typeof item.agentId === "string"
    && typeof item.sourceRunId === "string"
    && typeof item.actorId === "string"
    && (item.status === "running" || item.status === "completed" || item.status === "failed")
    && typeof item.reason === "string"
    && typeof item.requestedAt === "string";
}

function readStore(): WorkflowExecutionStore {
  const path = storePath();
  if (!existsSync(path)) return { version: 1, executions: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<WorkflowExecutionStore>;
    return {
      version: 1,
      executions: Array.isArray(parsed.executions)
        ? parsed.executions.filter(validRecord).slice(0, MAX_EXECUTIONS)
        : [],
    };
  } catch {
    return { version: 1, executions: [] };
  }
}

function writeStore(store: WorkflowExecutionStore): void {
  const path = storePath();
  mkdirSync(getDtaDataDir(), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ version: 1, executions: store.executions.slice(0, MAX_EXECUTIONS) }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temp, path);
}

function storedResult(result: unknown): unknown {
  try {
    const serialized = JSON.stringify(result);
    if (Buffer.byteLength(serialized) <= MAX_STORED_RESULT_BYTES) return result;
    return {
      truncated: true,
      bytes: Buffer.byteLength(serialized),
      sha256: createHash("sha256").update(serialized).digest("hex"),
    };
  } catch {
    return { unavailable: true, reason: "Workflow result is not JSON serializable" };
  }
}

export function listWorkflowExecutions(input: { agentId?: string; sourceRunId?: string } = {}): WorkflowExecutionRecord[] {
  return readStore().executions
    .filter((record) => !input.agentId || record.agentId === input.agentId)
    .filter((record) => !input.sourceRunId || record.sourceRunId === input.sourceRunId)
    .map((record) => structuredClone(record));
}

export function findWorkflowExecution(input: {
  workflowId: string;
  agentId: string;
  sourceRunId: string;
  idempotencyKey: string;
}): WorkflowExecutionRecord | null {
  return listWorkflowExecutions({ agentId: input.agentId, sourceRunId: input.sourceRunId }).find((record) => (
    record.workflowId === input.workflowId
    && record.idempotencyKey === input.idempotencyKey
  )) ?? null;
}

export function beginWorkflowExecution(input: Omit<WorkflowExecutionRecord, "id" | "status" | "requestedAt">): WorkflowExecutionRecord {
  const store = readStore();
  const record: WorkflowExecutionRecord = {
    ...input,
    id: randomUUID(),
    status: "running",
    requestedAt: new Date().toISOString(),
  };
  store.executions.unshift(record);
  writeStore(store);
  return structuredClone(record);
}

export function restartWorkflowExecution(id: string): WorkflowExecutionRecord {
  const store = readStore();
  const record = store.executions.find((candidate) => candidate.id === id);
  if (!record) throw new Error("Workflow execution not found");
  record.status = "running";
  record.requestedAt = new Date().toISOString();
  delete record.completedAt;
  delete record.result;
  delete record.error;
  writeStore(store);
  return structuredClone(record);
}

export function completeWorkflowExecution(id: string, result: unknown): WorkflowExecutionRecord {
  const store = readStore();
  const record = store.executions.find((candidate) => candidate.id === id);
  if (!record) throw new Error("Workflow execution not found");
  record.status = "completed";
  record.completedAt = new Date().toISOString();
  record.result = storedResult(result);
  delete record.error;
  writeStore(store);
  return structuredClone(record);
}

export function failWorkflowExecution(id: string, error: string): WorkflowExecutionRecord {
  const store = readStore();
  const record = store.executions.find((candidate) => candidate.id === id);
  if (!record) throw new Error("Workflow execution not found");
  record.status = "failed";
  record.completedAt = new Date().toISOString();
  record.error = error.slice(0, 2_000);
  delete record.result;
  writeStore(store);
  return structuredClone(record);
}

export function pruneWorkflowExecutionsBefore(cutoffMs: number, protectedRunIds: Set<string>, dryRun: boolean): number {
  const store = readStore();
  const removable = store.executions.filter((record) => record.status !== "running"
    && !protectedRunIds.has(record.sourceRunId)
    && Date.parse(record.completedAt ?? record.requestedAt) < cutoffMs);
  if (!dryRun && removable.length > 0) {
    const ids = new Set(removable.map((record) => record.id));
    store.executions = store.executions.filter((record) => !ids.has(record.id));
    writeStore(store);
  }
  return removable.length;
}
