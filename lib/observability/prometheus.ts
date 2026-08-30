import packageJson from "@/package.json";
import { readAgentRunStore } from "@/lib/agent-run-store";
import { listMeetingRuns } from "@/lib/agents/meeting/meeting-result-store";
import { isDtaConfigurationReady, loadDtaConfig } from "@/lib/config/env";
import { readAuditEvents } from "./audit-log";
import { renderRuntimeMetrics } from "./runtime-metrics";
import { listPMRuns } from "@/lib/agents/pm/pm-result-store";
import { listDepartmentRuns } from "@/lib/agents/department/department-result-store";
import { listMeetingMediaJobs } from "@/lib/agents/meeting/meeting-media-job-store";
import { listWorkflowExecutions } from "@/lib/integrations/n8n/workflow-execution-store";

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
  const pmRuns = listPMRuns(500);
  const departmentRuns = listDepartmentRuns(500);
  const mediaJobs = listMeetingMediaJobs(2_000);
  const workflows = listWorkflowExecutions();
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
  lines.push("# HELP dta_pm_reviews Current persisted PM revisions by review status.");
  lines.push("# TYPE dta_pm_reviews gauge");
  for (const [status, count] of counts(pmRuns.map((run) => run.reviewStatus))) lines.push(`dta_pm_reviews{status="${label(status)}"} ${count}`);
  lines.push("# HELP dta_department_reviews Current persisted Department Agent revisions by review status.");
  lines.push("# TYPE dta_department_reviews gauge");
  for (const [status, count] of counts(departmentRuns.map((run) => run.reviewStatus))) lines.push(`dta_department_reviews{status="${label(status)}"} ${count}`);
  lines.push("# HELP dta_media_jobs Current persisted media jobs by status and kind.");
  lines.push("# TYPE dta_media_jobs gauge");
  for (const [key, count] of counts(mediaJobs.map((job) => `${job.status}\u0000${job.kind}`))) {
    const [status, kind] = key.split("\u0000");
    lines.push(`dta_media_jobs{status="${label(status)}",kind="${label(kind)}"} ${count}`);
  }
  lines.push("# HELP dta_workflow_executions Current persisted workflow executions by status.");
  lines.push("# TYPE dta_workflow_executions gauge");
  for (const [status, count] of counts(workflows.map((execution) => execution.status))) lines.push(`dta_workflow_executions{status="${label(status)}"} ${count}`);
  lines.push("# HELP dta_audit_chain_valid Whether the local audit hash chain verifies.");
  lines.push("# TYPE dta_audit_chain_valid gauge");
  lines.push(`dta_audit_chain_valid ${audit.chainValid ? 1 : 0}`);
  lines.push("# HELP dta_adapter_info Selected runtime adapter providers.");
  lines.push("# TYPE dta_adapter_info gauge");
  lines.push(`dta_adapter_info{artifact_store="${label(config.artifactStoreProvider)}",memory_store="${label(config.memoryStoreProvider)}",workflow_provider="${label(config.workflowProvider)}",upload_scanner="${label(config.uploadScannerProvider)}"} 1`);
  lines.push("# HELP dta_retention_enabled Whether application-side local artifact retention is enabled.");
  lines.push("# TYPE dta_retention_enabled gauge");
  lines.push(`dta_retention_enabled ${config.retentionEnabled ? 1 : 0}`);
  lines.push("# HELP dta_retention_dry_run Whether retention reports candidates without deleting them.");
  lines.push("# TYPE dta_retention_dry_run gauge");
  lines.push(`dta_retention_dry_run ${config.retentionDryRun ? 1 : 0}`);
  lines.push("# HELP dta_legal_hold_runs Number of configured run legal holds.");
  lines.push("# TYPE dta_legal_hold_runs gauge");
  lines.push(`dta_legal_hold_runs ${config.legalHoldRunIds.length}`);
  lines.push("# HELP dta_agent_run_finished_total Agent run outcomes observed by this process.");
  lines.push("# TYPE dta_agent_run_finished_total counter");
  lines.push("# HELP dta_agent_run_duration_seconds Agent run duration observed by this process.");
  lines.push("# TYPE dta_agent_run_duration_seconds histogram");
  lines.push("# HELP dta_agent_tokens_total Model tokens observed by this process.");
  lines.push("# TYPE dta_agent_tokens_total counter");
  lines.push("# HELP dta_agent_cost_currency_total Provider-reported model cost observed by this process.");
  lines.push("# TYPE dta_agent_cost_currency_total counter");
  lines.push("# HELP dta_media_job_finished_total Meeting media job outcomes observed by this process.");
  lines.push("# TYPE dta_media_job_finished_total counter");
  lines.push("# HELP dta_media_job_duration_seconds Meeting media job duration observed by this process.");
  lines.push("# TYPE dta_media_job_duration_seconds histogram");
  lines.push("# HELP dta_workflow_execution_total Workflow outcomes observed by this process.");
  lines.push("# TYPE dta_workflow_execution_total counter");
  lines.push("# HELP dta_workflow_duration_seconds Workflow duration observed by this process.");
  lines.push("# TYPE dta_workflow_duration_seconds histogram");
  lines.push("# HELP dta_sse_connections_total SSE connections accepted by this process.");
  lines.push("# TYPE dta_sse_connections_total counter");
  lines.push("# HELP dta_sse_connections_active Currently open SSE connections.");
  lines.push("# TYPE dta_sse_connections_active gauge");
  lines.push(...renderRuntimeMetrics());
  return `${lines.join("\n")}\n`;
}
