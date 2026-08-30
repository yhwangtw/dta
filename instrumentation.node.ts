import { ensureAgentRunSupervisor } from "./lib/agent-run-supervisor";
import { ensureScheduleRunner } from "./lib/schedule-runner";
import { dtaConfigurationIssues, loadDtaConfig } from "./lib/config/env";
import { runRetentionSweep } from "./lib/governance/retention";
import { ensureMeetingMediaJobRunner } from "./lib/agents/meeting/meeting-media-job-runner";

declare global {
  var __dtaConfigurationReported: boolean | undefined;
  var __dtaRetentionTimer: ReturnType<typeof setInterval> | undefined;
}

export function registerScheduleRunner(): void {
  if (!globalThis.__dtaConfigurationReported) {
    globalThis.__dtaConfigurationReported = true;
    const config = loadDtaConfig();
    console.info(`[DTA] dataDir=${config.dataDir} defaultAgent=${config.defaultAgentId} auth=${config.authMode} artifacts=${config.artifactStoreProvider} memory=${config.memoryStoreProvider} workflows=${config.workflowProvider} transcription=${config.transcriptionProvider} scanner=${config.uploadScannerProvider}`);
    for (const issue of dtaConfigurationIssues(config)) {
      const message = `[DTA] ${issue.code}: ${issue.message}`;
      if (issue.severity === "error") console.error(message);
      else console.warn(message);
    }
  }
  ensureScheduleRunner();
  // Resume explicitly queued work from trusted projects when the long-lived
  // Node server starts. Active work from a previous process is never replayed:
  // the supervisor marks it interrupted to avoid duplicate tool side effects.
  ensureAgentRunSupervisor();
  // Media jobs persist independently from the upload request. An interrupted
  // job remains visible and retryable instead of disappearing with the pod.
  ensureMeetingMediaJobRunner();
  void runRetentionSweep().catch((error) => {
    console.error(`[DTA] retention sweep failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (loadDtaConfig().retentionEnabled && !globalThis.__dtaRetentionTimer) {
    globalThis.__dtaRetentionTimer = setInterval(() => {
      void runRetentionSweep().catch((error) => {
        console.error(`[DTA] retention sweep failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 24 * 60 * 60 * 1_000);
    globalThis.__dtaRetentionTimer.unref?.();
  }
}
