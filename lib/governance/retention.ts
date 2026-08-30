import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { loadDtaConfig, type DtaConfig } from "@/lib/config/env";
import { deleteMeetingRun, listMeetingRuns } from "@/lib/agents/meeting/meeting-result-store";
import { deletePMRun, listPMRuns } from "@/lib/agents/pm/pm-result-store";
import { deleteDepartmentRun, listDepartmentRuns } from "@/lib/agents/department/department-result-store";
import { deleteMeetingMediaJob, listMeetingMediaJobs } from "@/lib/agents/meeting/meeting-media-job-store";
import { getArtifactStore } from "@/lib/integrations/storage/artifact-store-factory";
import { listWorkflowExecutions, pruneWorkflowExecutionsBefore } from "@/lib/integrations/n8n/workflow-execution-store";
import { pruneAgentRunsBefore, readAgentRunStore } from "@/lib/agent-run-store";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export interface RetentionSweepCounts {
  artifacts: number;
  runs: number;
  mediaJobs: number;
  workflows: number;
  memoryFiles: number;
}

export interface RetentionSweepResult {
  status: "disabled" | "completed";
  dryRun: boolean;
  inspected: number;
  deleted: number;
  protected: number;
  inspectedByType: RetentionSweepCounts;
  deletedByType: RetentionSweepCounts;
  protectedByType: RetentionSweepCounts;
  delegated: string[];
}

let activeSweep: Promise<RetentionSweepResult> | null = null;

function emptyCounts(): RetentionSweepCounts {
  return { artifacts: 0, runs: 0, mediaJobs: 0, workflows: 0, memoryFiles: 0 };
}

function sum(counts: RetentionSweepCounts): number {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

function heldMemoryFile(path: string, legalHolds: Set<string>): boolean {
  if (legalHolds.size === 0) return false;
  try {
    const raw = readFileSync(path, "utf8");
    return [...legalHolds].some((runId) => raw.includes(runId));
  } catch {
    return true;
  }
}

async function sweep(config: DtaConfig): Promise<RetentionSweepResult> {
  const inspectedByType = emptyCounts();
  const deletedByType = emptyCounts();
  const protectedByType = emptyCounts();
  const delegated: string[] = [];
  const result = (): RetentionSweepResult => ({
    status: config.retentionEnabled ? "completed" : "disabled",
    dryRun: config.retentionDryRun,
    inspected: sum(inspectedByType),
    deleted: sum(deletedByType),
    protected: sum(protectedByType),
    inspectedByType,
    deletedByType,
    protectedByType,
    delegated,
  });
  if (!config.retentionEnabled) return result();

  const now = Date.now();
  const runCutoff = now - config.runRetentionDays * 86_400_000;
  const artifactCutoff = now - config.artifactRetentionDays * 86_400_000;
  const mediaCutoff = now - config.mediaJobRetentionDays * 86_400_000;
  const workflowCutoff = now - config.workflowRetentionDays * 86_400_000;
  const memoryCutoff = now - config.memoryTtlSeconds * 1_000;
  const legalHolds = new Set(config.legalHoldRunIds);
  const meetings = listMeetingRuns(10_000);
  const pmRuns = listPMRuns(10_000);
  const departmentRuns = listDepartmentRuns(10_000);
  const genericRuns = readAgentRunStore().runs;
  const mediaJobs = listMeetingMediaJobs(10_000);
  const allDomainRuns = [...meetings, ...pmRuns, ...departmentRuns];
  const protectedRunIds = new Set(legalHolds);
  if (config.retentionProtectApproved) {
    for (const run of allDomainRuns) if (run.reviewStatus === "approved") protectedRunIds.add(run.runId);
  }

  // Artifact and workflow retention must never create dangling references.
  // Keep dependencies for every run that is not itself eligible for pruning,
  // in addition to explicit legal holds and approved revisions.
  const retainedRunIds = new Set(protectedRunIds);
  for (const run of allDomainRuns) {
    if (Date.parse(run.updatedAt) >= runCutoff) retainedRunIds.add(run.runId);
  }
  for (const run of genericRuns) {
    const retained = ["queued", "running", "waiting_for_input"].includes(run.status)
      || Date.parse(run.finishedAt ?? run.createdAt) >= runCutoff
      || protectedRunIds.has(run.id)
      || protectedRunIds.has(run.agentMetadata?.runId ?? "");
    if (!retained) continue;
    retainedRunIds.add(run.id);
    if (run.agentMetadata?.runId) retainedRunIds.add(run.agentMetadata.runId);
  }

  const protectedArtifactIds = new Set(allDomainRuns
    .filter((run) => retainedRunIds.has(run.runId))
    .flatMap((run) => run.artifacts.map((artifact) => artifact.id)));
  for (const run of genericRuns.filter((candidate) => retainedRunIds.has(candidate.id) || retainedRunIds.has(candidate.agentMetadata?.runId ?? ""))) {
    for (const artifact of run.artifacts ?? []) protectedArtifactIds.add(artifact.id);
  }
  for (const meeting of meetings.filter((run) => retainedRunIds.has(run.runId))) {
    if (meeting.result?.transcriptArtifactId) protectedArtifactIds.add(meeting.result.transcriptArtifactId);
    for (const artifactId of [
      ...meeting.result?.decisions.flatMap((entry) => entry.evidence.map((evidence) => evidence.artifactId)) ?? [],
      ...meeting.result?.actionItems.flatMap((entry) => entry.evidence.map((evidence) => evidence.artifactId)) ?? [],
      ...meeting.result?.requirements.flatMap((entry) => entry.evidence.map((evidence) => evidence.artifactId)) ?? [],
    ]) if (artifactId) protectedArtifactIds.add(artifactId);
  }
  for (const job of mediaJobs) {
    const current = job.status === "queued" || job.status === "processing"
      || Date.parse(job.finishedAt ?? job.updatedAt) >= mediaCutoff
      || Boolean(job.runId && retainedRunIds.has(job.runId));
    if (!current) continue;
    protectedArtifactIds.add(job.sourceArtifactId);
    const mediaResult = job.result;
    for (const artifactId of [
      mediaResult?.artifactId,
      mediaResult?.transcriptArtifactId,
      mediaResult?.audioArtifactId,
      mediaResult?.visualAnalysisArtifactId,
      mediaResult?.timelineArtifactId,
      ...(mediaResult?.keyframeArtifactIds ?? []),
    ]) if (artifactId) protectedArtifactIds.add(artifactId);
  }
  const store = getArtifactStore();
  if (!store.list || !store.delete) {
    delegated.push("artifacts");
  } else {
    const artifacts = await store.list();
    inspectedByType.artifacts = artifacts.length;
    for (const artifact of artifacts) {
      if (Date.parse(artifact.createdAt) >= artifactCutoff) continue;
      const artifactRunId = typeof artifact.metadata?.runId === "string" ? artifact.metadata.runId : undefined;
      if (protectedArtifactIds.has(artifact.id) || Boolean(artifactRunId && retainedRunIds.has(artifactRunId))) {
        protectedByType.artifacts += 1;
        continue;
      }
      deletedByType.artifacts += 1;
      if (!config.retentionDryRun) await store.delete(artifact.id);
    }
  }

  const domainCandidates = [
    ...meetings.map((run) => ({ run, remove: () => deleteMeetingRun(run.runId) })),
    ...pmRuns.map((run) => ({ run, remove: () => deletePMRun(run.runId) })),
    ...departmentRuns.map((run) => ({ run, remove: () => deleteDepartmentRun(run.runId) })),
  ];
  inspectedByType.runs += domainCandidates.length;
  for (const candidate of domainCandidates) {
    if (Date.parse(candidate.run.updatedAt) >= runCutoff) continue;
    if (protectedRunIds.has(candidate.run.runId)) {
      protectedByType.runs += 1;
      continue;
    }
    deletedByType.runs += 1;
    if (!config.retentionDryRun) candidate.remove();
  }
  inspectedByType.runs += genericRuns.length;
  protectedByType.runs += genericRuns.filter((run) => !["queued", "running", "waiting_for_input"].includes(run.status)
    && Date.parse(run.finishedAt ?? run.createdAt) < runCutoff
    && (protectedRunIds.has(run.id) || protectedRunIds.has(run.agentMetadata?.runId ?? ""))).length;
  deletedByType.runs += pruneAgentRunsBefore(runCutoff, protectedRunIds, config.retentionDryRun);

  inspectedByType.mediaJobs = mediaJobs.length;
  for (const job of mediaJobs) {
    if (job.status === "queued" || job.status === "processing" || Date.parse(job.finishedAt ?? job.updatedAt) >= mediaCutoff) continue;
    if (job.runId && retainedRunIds.has(job.runId)) {
      protectedByType.mediaJobs += 1;
      continue;
    }
    deletedByType.mediaJobs += 1;
    if (!config.retentionDryRun) deleteMeetingMediaJob(job.id);
  }

  const workflowRecords = listWorkflowExecutions();
  inspectedByType.workflows = workflowRecords.length;
  protectedByType.workflows = workflowRecords.filter((record) => retainedRunIds.has(record.sourceRunId) && Date.parse(record.completedAt ?? record.requestedAt) < workflowCutoff).length;
  deletedByType.workflows = pruneWorkflowExecutionsBefore(workflowCutoff, retainedRunIds, config.retentionDryRun);

  if (config.memoryStoreProvider !== "local") {
    delegated.push("memory");
  } else {
    const memoryDir = join(config.dataDir, "memory");
    const names = existsSync(memoryDir) ? readdirSync(memoryDir).filter((name) => name.endsWith(".json")) : [];
    inspectedByType.memoryFiles = names.length;
    for (const name of names) {
      const path = join(memoryDir, name);
      let updatedAt = 0;
      try { updatedAt = Date.parse((JSON.parse(readFileSync(path, "utf8")) as { updatedAt?: string }).updatedAt ?? ""); }
      catch { updatedAt = 0; }
      if (updatedAt >= memoryCutoff) continue;
      if (heldMemoryFile(path, legalHolds)) {
        protectedByType.memoryFiles += 1;
        continue;
      }
      deletedByType.memoryFiles += 1;
      if (!config.retentionDryRun) unlinkSync(path);
    }
  }

  // Pi JSONL session retention remains delegated because deleting a session
  // requires coordinated removal from ownership, tags, pins, schedules, and
  // the active runtime registry rather than unlinking one file in isolation.
  delegated.push("piSessions");

  const completed = result();
  recordAuditEvent({
    action: config.retentionDryRun ? "retention.sweep.preview" : "retention.sweep",
    actorId: "dta-retention",
    resourceType: "dta_data",
    resourceId: config.dataDir,
    outcome: "success",
    metadata: {
      inspected: completed.inspected,
      deleted: completed.deleted,
      protected: completed.protected,
      dryRun: config.retentionDryRun,
      legalHolds: legalHolds.size,
    },
  });
  return completed;
}

export function runRetentionSweep(config: DtaConfig = loadDtaConfig()): Promise<RetentionSweepResult> {
  activeSweep ??= sweep(config).finally(() => { activeSweep = null; });
  return activeSweep;
}
