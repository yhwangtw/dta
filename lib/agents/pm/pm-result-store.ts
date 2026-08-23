import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import { isPMResult, type StoredPMResult } from "./pm-types";

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
    return raw;
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
