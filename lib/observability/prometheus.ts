import packageJson from "@/package.json";
import { readAgentRunStore } from "@/lib/agent-run-store";
import { listMeetingRuns } from "@/lib/agents/meeting/meeting-result-store";
import { isDtaConfigurationReady, loadDtaConfig } from "@/lib/config/env";
import { readAuditEvents } from "./audit-log";

function label(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function counts(values: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

export function renderPrometheusMetrics(): string {
  const config = loadDtaConfig();
  const runs = readAgentRunStore().runs;
  const meetings = listMeetingRuns(500);
  const audit = readAuditEvents(1_000);
  const lines = [
    "# HELP dta_info Static DTA build information.",
    "# TYPE dta_info gauge",
    `dta_info{version="${label(packageJson.version)}"} 1`,
    "# HELP dta_configuration_ready Whether selected runtime adapters are fully configured.",
    "# TYPE dta_configuration_ready gauge",
    `dta_configuration_ready ${isDtaConfigurationReady(config) ? 1 : 0}`,
    "# HELP dta_process_uptime_seconds Process uptime in seconds.",
    "# TYPE dta_process_uptime_seconds gauge",
    `dta_process_uptime_seconds ${process.uptime().toFixed(3)}`,
    "# HELP dta_process_resident_memory_bytes Resident process memory.",
    "# TYPE dta_process_resident_memory_bytes gauge",
    `dta_process_resident_memory_bytes ${process.memoryUsage().rss}`,
    "# HELP dta_agent_runs Current persisted Agent runs by status.",
    "# TYPE dta_agent_runs gauge",
  ];
  for (const [status, count] of counts(runs.map((run) => run.status))) lines.push(`dta_agent_runs{status="${label(status)}"} ${count}`);
  lines.push("# HELP dta_meeting_reviews Current persisted Meeting revisions by review status.");
  lines.push("# TYPE dta_meeting_reviews gauge");
  for (const [status, count] of counts(meetings.map((run) => run.reviewStatus))) lines.push(`dta_meeting_reviews{status="${label(status)}"} ${count}`);
  lines.push("# HELP dta_audit_chain_valid Whether the local audit hash chain verifies.");
  lines.push("# TYPE dta_audit_chain_valid gauge");
  lines.push(`dta_audit_chain_valid ${audit.chainValid ? 1 : 0}`);
  lines.push("# HELP dta_adapter_info Selected runtime adapter providers.");
  lines.push("# TYPE dta_adapter_info gauge");
  lines.push(`dta_adapter_info{artifact_store="${label(config.artifactStoreProvider)}",memory_store="${label(config.memoryStoreProvider)}",workflow_provider="${label(config.workflowProvider)}",upload_scanner="${label(config.uploadScannerProvider)}"} 1`);
  lines.push("# HELP dta_retention_enabled Whether application-side local artifact retention is enabled.");
  lines.push("# TYPE dta_retention_enabled gauge");
  lines.push(`dta_retention_enabled ${config.retentionEnabled ? 1 : 0}`);
  return `${lines.join("\n")}\n`;
}
