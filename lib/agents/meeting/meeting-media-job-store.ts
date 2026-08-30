import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";
import type { MeetingSourceExtractionResult, MeetingMediaJobStatus } from "@/lib/meeting-source-files";

export interface MeetingMediaJobProgress {
  stage: "queued" | "probing" | "transcribing" | "vision" | "publishing" | "completed" | "failed" | "cancelled";
  percent: number;
  message: string;
}

export interface MeetingMediaJob {
  id: string;
  userId: string;
  runId?: string;
  projectId?: string;
  conversationId?: string;
  sourceArtifactId: string;
  name: string;
  size: number;
  kind: "audio" | "video";
  status: MeetingMediaJobStatus;
  progress: MeetingMediaJobProgress;
  attempts: number;
  maxAttempts: number;
  result?: MeetingSourceExtractionResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

const SAFE_ID = /^[0-9a-f-]{36}$/i;

function directory(): string {
  return join(getDtaDataDir(), "meeting-media-jobs");
}

function pathFor(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error("Meeting media job not found");
  return join(directory(), `${id}.json`);
}

function isJob(value: unknown): value is MeetingMediaJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const job = value as Partial<MeetingMediaJob>;
  return typeof job.id === "string" && SAFE_ID.test(job.id)
    && typeof job.userId === "string" && typeof job.sourceArtifactId === "string"
    && typeof job.name === "string" && typeof job.size === "number"
    && (job.kind === "audio" || job.kind === "video")
    && ["queued", "processing", "completed", "failed", "cancelled"].includes(job.status ?? "")
    && Number.isInteger(job.attempts) && (job.attempts ?? -1) >= 0
    && Number.isInteger(job.maxAttempts) && (job.maxAttempts ?? 0) >= 1
    && Boolean(job.progress) && typeof job.progress === "object"
    && typeof job.progress?.percent === "number" && job.progress.percent >= 0 && job.progress.percent <= 100
    && typeof job.progress?.message === "string" && typeof job.progress?.stage === "string"
    && typeof job.createdAt === "string" && typeof job.updatedAt === "string"
    && (job.runId === undefined || typeof job.runId === "string")
    && (job.projectId === undefined || typeof job.projectId === "string")
    && (job.conversationId === undefined || typeof job.conversationId === "string");
}

export function readMeetingMediaJob(id: string): MeetingMediaJob | null {
  const path = pathFor(id);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return isJob(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeMeetingMediaJob(job: MeetingMediaJob): MeetingMediaJob {
  mkdirSync(directory(), { recursive: true, mode: 0o700 });
  const path = pathFor(job.id);
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(job, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
  return structuredClone(job);
}

export function createMeetingMediaJob(input: Omit<MeetingMediaJob, "id" | "status" | "progress" | "attempts" | "createdAt" | "updatedAt">): MeetingMediaJob {
  const now = new Date().toISOString();
  return writeMeetingMediaJob({
    ...input,
    id: randomUUID(),
    status: "queued",
    progress: { stage: "queued", percent: 0, message: "Waiting for a media worker" },
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export function updateMeetingMediaJob(id: string, mutate: (job: MeetingMediaJob) => MeetingMediaJob): MeetingMediaJob {
  const current = readMeetingMediaJob(id);
  if (!current) throw new Error("Meeting media job not found");
  const updated = mutate(structuredClone(current));
  updated.updatedAt = new Date().toISOString();
  return writeMeetingMediaJob(updated);
}

export function attachMeetingMediaJobToRun(id: string, input: { runId: string; userId: string }): MeetingMediaJob {
  return updateMeetingMediaJob(id, (job) => {
    if (job.userId !== input.userId) throw new Error("Meeting media job is not owned by this Agent run");
    if (job.runId && job.runId !== input.runId) throw new Error("Meeting media job is already attached to another Agent run");
    return { ...job, runId: input.runId };
  });
}

export function listMeetingMediaJobs(limit = 500): MeetingMediaJob[] {
  let names: string[];
  try { names = readdirSync(directory()); }
  catch { return []; }
  return names.filter((name) => SAFE_ID.test(name.replace(/\.json$/, "")) && name.endsWith(".json"))
    .flatMap((name) => {
      const job = readMeetingMediaJob(name.slice(0, -5));
      return job ? [job] : [];
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, Math.max(1, Math.min(limit, 10_000)));
}

export function reconcileInterruptedMeetingMediaJobs(): number {
  let changed = 0;
  for (const job of listMeetingMediaJobs(2_000)) {
    if (job.status !== "processing") continue;
    updateMeetingMediaJob(job.id, (current) => ({
      ...current,
      status: "failed",
      error: "The DTA server restarted while this media job was processing. Retry is safe from the Meeting workspace.",
      progress: { stage: "failed", percent: current.progress.percent, message: "Interrupted by server restart" },
      finishedAt: new Date().toISOString(),
    }));
    changed++;
  }
  return changed;
}

export function deleteMeetingMediaJob(id: string): boolean {
  const path = pathFor(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
