import { loadDtaConfig } from "@/lib/config/env";
import { understandMeetingMedia } from "./meeting-media-pipeline";
import {
  createMeetingMediaJob,
  listMeetingMediaJobs,
  readMeetingMediaJob,
  reconcileInterruptedMeetingMediaJobs,
  updateMeetingMediaJob,
  type MeetingMediaJob,
} from "./meeting-media-job-store";
import type { ArtifactOwnership } from "@/lib/integrations/storage/artifact-access";
import { recordMediaJobFinished } from "@/lib/observability/runtime-metrics";
import { recordAuditEvent } from "@/lib/observability/audit-log";

function resultFromUnderstanding(job: MeetingMediaJob, understanding: Awaited<ReturnType<typeof understandMeetingMedia>>) {
  const hasEvidence = Boolean(understanding.content?.trim());
  return {
    name: job.name,
    size: job.size,
    ok: hasEvidence,
    kind: job.kind,
    ...(understanding.content ? { content: understanding.content } : {}),
    chars: understanding.chars,
    artifactId: job.sourceArtifactId,
    jobId: job.id,
    ...(understanding.transcriptArtifactId ? { transcriptArtifactId: understanding.transcriptArtifactId } : {}),
    ...(understanding.audioArtifactId ? { audioArtifactId: understanding.audioArtifactId } : {}),
    ...(understanding.visualAnalysisArtifactId ? { visualAnalysisArtifactId: understanding.visualAnalysisArtifactId } : {}),
    ...(understanding.timelineArtifactId ? { timelineArtifactId: understanding.timelineArtifactId } : {}),
    keyframeArtifactIds: understanding.keyframeArtifactIds,
    ...(understanding.durationSeconds ? { durationSeconds: understanding.durationSeconds } : {}),
    transcriptSegmentCount: understanding.transcriptSegmentCount,
    keyframeCount: understanding.keyframeCount,
    transcriptionStatus: understanding.transcriptionStatus,
    visionStatus: understanding.visionStatus,
    warnings: understanding.warnings,
    processingStatus: hasEvidence ? "completed" as const : "failed" as const,
    ...(!hasEvidence ? { error: understanding.warnings.join(" · ") || "No usable audio or visual evidence was produced" } : {}),
  };
}

export class MeetingMediaJobRunner {
  private readonly active = new Map<string, AbortController>();
  private draining = false;

  constructor() {
    reconcileInterruptedMeetingMediaJobs();
    this.kick();
  }

  enqueue(input: {
    sourceArtifactId: string;
    name: string;
    size: number;
    kind: "audio" | "video";
    ownership: ArtifactOwnership;
  }): MeetingMediaJob {
    const job = createMeetingMediaJob({
      sourceArtifactId: input.sourceArtifactId,
      name: input.name,
      size: input.size,
      kind: input.kind,
      userId: input.ownership.userId ?? "local-user",
      ...(input.ownership.runId ? { runId: input.ownership.runId } : {}),
      ...(input.ownership.projectId ? { projectId: input.ownership.projectId } : {}),
      ...(input.ownership.conversationId ? { conversationId: input.ownership.conversationId } : {}),
      maxAttempts: loadDtaConfig().mediaJobMaxAttempts,
    });
    this.kick();
    return job;
  }

  retry(id: string): MeetingMediaJob {
    const job = updateMeetingMediaJob(id, (current) => {
      if (current.status !== "failed" && current.status !== "cancelled") throw new Error("Only failed or cancelled media jobs can be retried");
      if (current.attempts >= current.maxAttempts) throw new Error("Media job retry limit reached");
      return {
        ...current,
        status: "queued",
        progress: { stage: "queued", percent: 0, message: "Waiting for retry" },
        error: undefined,
        result: undefined,
        startedAt: undefined,
        finishedAt: undefined,
      };
    });
    this.kick();
    return job;
  }

  cancel(id: string): MeetingMediaJob {
    const current = readMeetingMediaJob(id);
    if (!current) throw new Error("Meeting media job not found");
    if (current.status === "completed") throw new Error("Completed media jobs cannot be cancelled");
    const wasActive = this.active.has(id);
    this.active.get(id)?.abort();
    const cancelled = updateMeetingMediaJob(id, (job) => ({
      ...job,
      status: "cancelled",
      error: "Cancelled by the user",
      progress: { stage: "cancelled", percent: job.progress.percent, message: "Cancelled" },
      finishedAt: new Date().toISOString(),
    }));
    if (!wasActive) recordMediaJobFinished({ kind: cancelled.kind, status: "cancelled", durationMs: 0 });
    return cancelled;
  }

  private kick(): void {
    if (this.draining) return;
    this.draining = true;
    setTimeout(() => void this.drain(), 0).unref?.();
  }

  private async drain(): Promise<void> {
    try {
      const concurrency = loadDtaConfig().mediaJobConcurrency;
      while (this.active.size < concurrency) {
        const next = listMeetingMediaJobs(2_000).reverse().find((job) => job.status === "queued" && !this.active.has(job.id));
        if (!next) break;
        void this.run(next);
      }
    } finally {
      this.draining = false;
    }
  }

  private async run(job: MeetingMediaJob): Promise<void> {
    const controller = new AbortController();
    this.active.set(job.id, controller);
    const startedAt = new Date().toISOString();
    updateMeetingMediaJob(job.id, (current) => ({
      ...current,
      status: "processing",
      attempts: current.attempts + 1,
      startedAt,
      finishedAt: undefined,
      error: undefined,
      progress: { stage: "probing", percent: 5, message: "Inspecting media" },
    }));
    try {
      const understanding = await understandMeetingMedia({ artifactId: job.sourceArtifactId, name: job.name, kind: job.kind }, {}, {
        signal: controller.signal,
        onProgress: (progress) => {
          const current = readMeetingMediaJob(job.id);
          if (!current || current.status === "cancelled") return;
          updateMeetingMediaJob(job.id, (item) => ({ ...item, progress }));
        },
      });
      if (controller.signal.aborted || readMeetingMediaJob(job.id)?.status === "cancelled") return;
      const result = resultFromUnderstanding(job, understanding);
      updateMeetingMediaJob(job.id, (current) => ({
        ...current,
        status: result.ok ? "completed" : "failed",
        result,
        ...(result.ok ? {} : { error: result.error }),
        progress: result.ok
          ? { stage: "completed", percent: 100, message: "Media evidence is ready" }
          : { stage: "failed", percent: 100, message: result.error || "Media processing failed" },
        finishedAt: new Date().toISOString(),
      }));
    } catch (error) {
      if (controller.signal.aborted || readMeetingMediaJob(job.id)?.status === "cancelled") return;
      const message = error instanceof Error ? error.message : String(error);
      updateMeetingMediaJob(job.id, (current) => ({
        ...current,
        status: "failed",
        error: message,
        progress: { stage: "failed", percent: current.progress.percent, message },
        finishedAt: new Date().toISOString(),
      }));
    } finally {
      const finished = readMeetingMediaJob(job.id);
      if (finished && (finished.status === "completed" || finished.status === "failed" || finished.status === "cancelled")) {
        recordMediaJobFinished({
          kind: finished.kind,
          status: finished.status,
          durationMs: finished.startedAt ? Math.max(0, Date.parse(finished.finishedAt ?? new Date().toISOString()) - Date.parse(finished.startedAt)) : undefined,
        });
        recordAuditEvent({
          action: `meeting.media.${finished.status}`,
          actorId: finished.userId,
          resourceType: "meeting_media_job",
          resourceId: finished.id,
          outcome: finished.status === "completed" ? "success" : "failure",
          metadata: { kind: finished.kind, attempts: finished.attempts, sourceArtifactId: finished.sourceArtifactId },
        });
      }
      this.active.delete(job.id);
      this.kick();
    }
  }
}

declare global {
  var __dtaMeetingMediaJobRunner: MeetingMediaJobRunner | undefined;
}

export function ensureMeetingMediaJobRunner(): MeetingMediaJobRunner {
  globalThis.__dtaMeetingMediaJobRunner ??= new MeetingMediaJobRunner();
  return globalThis.__dtaMeetingMediaJobRunner;
}
