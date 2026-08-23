import { loadDtaConfig, type DtaConfig } from "@/lib/config/env";
import { listMeetingRuns } from "@/lib/agents/meeting/meeting-result-store";
import { getArtifactStore } from "@/lib/integrations/storage/artifact-store-factory";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export interface RetentionSweepResult {
  status: "disabled" | "completed" | "delegated";
  inspected: number;
  deleted: number;
  protected: number;
}

let activeSweep: Promise<RetentionSweepResult> | null = null;

async function sweep(config: DtaConfig): Promise<RetentionSweepResult> {
  if (!config.retentionEnabled) return { status: "disabled", inspected: 0, deleted: 0, protected: 0 };
  const store = getArtifactStore();
  if (!store.list || !store.delete) {
    return { status: "delegated", inspected: 0, deleted: 0, protected: 0 };
  }
  const protectedIds = config.retentionProtectApproved
    ? new Set(listMeetingRuns(500)
      .filter((run) => run.reviewStatus === "approved")
      .flatMap((run) => run.artifacts.map((artifact) => artifact.id)))
    : new Set<string>();
  const cutoff = Date.now() - config.artifactRetentionDays * 24 * 60 * 60 * 1_000;
  const artifacts = await store.list();
  let deleted = 0;
  let protectedCount = 0;
  for (const artifact of artifacts) {
    if (Date.parse(artifact.createdAt) >= cutoff) continue;
    if (protectedIds.has(artifact.id)) {
      protectedCount++;
      continue;
    }
    await store.delete(artifact.id);
    deleted++;
  }
  recordAuditEvent({
    action: "retention.artifact.sweep",
    actorId: "dta-retention",
    resourceType: "artifact_store",
    resourceId: config.artifactStoreProvider,
    outcome: "success",
    metadata: { inspected: artifacts.length, deleted, protected: protectedCount, retentionDays: config.artifactRetentionDays },
  });
  return { status: "completed", inspected: artifacts.length, deleted, protected: protectedCount };
}

export function runRetentionSweep(config: DtaConfig = loadDtaConfig()): Promise<RetentionSweepResult> {
  activeSweep ??= sweep(config).finally(() => { activeSweep = null; });
  return activeSweep;
}
