import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";
import { isMeetingResult, type StoredMeetingResult } from "./meeting-types";

function resultPath(runId: string): string {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(runId)) throw new Error("Invalid meeting run id");
  return join(getDtaDataDir(), "meeting-runs", `${runId}.json`);
}

export function readMeetingRun(runId: string): StoredMeetingResult | null {
  const path = resultPath(runId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as StoredMeetingResult;
    if (!raw || raw.runId !== runId || !Array.isArray(raw.artifacts)) return null;
    if (raw.result && !isMeetingResult(raw.result)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeMeetingRun(run: StoredMeetingResult): void {
  const path = resultPath(run.runId);
  mkdirSync(join(getDtaDataDir(), "meeting-runs"), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(run, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
}

export function ensureMeetingRun(runId: string, sessionId?: string): StoredMeetingResult {
  const existing = readMeetingRun(runId);
  if (existing) {
    if (sessionId && existing.sessionId !== sessionId) {
      const next = { ...existing, sessionId, updatedAt: new Date().toISOString() };
      writeMeetingRun(next);
      return next;
    }
    return existing;
  }
  const created: StoredMeetingResult = {
    runId,
    ...(sessionId ? { sessionId } : {}),
    status: "running",
    artifacts: [],
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
    error: error.slice(0, 2_000),
    updatedAt: new Date().toISOString(),
  };
  writeMeetingRun(failed);
  return failed;
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
    .slice(0, Math.max(1, Math.min(limit, 500)));
}
