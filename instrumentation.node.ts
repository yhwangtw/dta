import { ensureAgentRunSupervisor } from "./lib/agent-run-supervisor";
import { ensureScheduleRunner } from "./lib/schedule-runner";
import { dtaCapabilityWarnings, loadDtaConfig } from "./lib/config/env";

declare global {
  var __dtaConfigurationReported: boolean | undefined;
}

export function registerScheduleRunner(): void {
  if (!globalThis.__dtaConfigurationReported) {
    globalThis.__dtaConfigurationReported = true;
    const config = loadDtaConfig();
    console.info(`[DTA] dataDir=${config.dataDir} defaultAgent=${config.defaultAgentType} transcription=${config.transcriptionProvider}`);
    for (const warning of dtaCapabilityWarnings(config)) console.warn(`[DTA] ${warning}`);
  }
  ensureScheduleRunner();
  // Resume explicitly queued work from trusted projects when the long-lived
  // Node server starts. Active work from a previous process is never replayed:
  // the supervisor marks it interrupted to avoid duplicate tool side effects.
  ensureAgentRunSupervisor();
}
