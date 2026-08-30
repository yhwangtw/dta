import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAuditEvents, recordAuditEvent, resetAuditLogForTests } from "../observability/audit-log";
import { renderPrometheusMetrics } from "../observability/prometheus";
import { beginSseConnection, recordAgentRunFinished, recordMediaJobFinished, recordWorkflowFinished, resetRuntimeMetricsForTests } from "../observability/runtime-metrics";

const originalPath = process.env.DTA_AUDIT_LOG_PATH;
const originalEnabled = process.env.DTA_AUDIT_LOG_ENABLED;
const originalDataDir = process.env.DTA_DATA_DIR;

afterEach(() => {
  if (originalPath === undefined) delete process.env.DTA_AUDIT_LOG_PATH; else process.env.DTA_AUDIT_LOG_PATH = originalPath;
  if (originalEnabled === undefined) delete process.env.DTA_AUDIT_LOG_ENABLED; else process.env.DTA_AUDIT_LOG_ENABLED = originalEnabled;
  if (originalDataDir === undefined) delete process.env.DTA_DATA_DIR; else process.env.DTA_DATA_DIR = originalDataDir;
  resetAuditLogForTests();
  resetRuntimeMetricsForTests();
});

describe("DTA audit and metrics", () => {
  it("writes a tamper-evident audit chain without storing task payloads", () => {
    const root = mkdtempSync(join(tmpdir(), "dta-audit-"));
    try {
      process.env.DTA_DATA_DIR = root;
      process.env.DTA_AUDIT_LOG_PATH = join(root, "audit.jsonl");
      process.env.DTA_AUDIT_LOG_ENABLED = "true";
      recordAuditEvent({ action: "agent.run.submit", actorId: "user-1", resourceType: "agent_run", resourceId: "run-1", outcome: "success", metadata: { agentId: "meeting-agent" } });
      recordAuditEvent({ action: "meeting.review.approved", actorId: "reviewer-1", resourceType: "meeting_run", resourceId: "run-1", outcome: "success" });
      const audit = readAuditEvents();
      expect(audit.chainValid).toBe(true);
      expect(audit.events).toHaveLength(2);
      expect(audit.events[0].previousHash).toBe(audit.events[1].hash);
      expect(JSON.stringify(audit.events)).not.toContain("CALLER TASK");

      appendFileSync(process.env.DTA_AUDIT_LOG_PATH, `${JSON.stringify({ ...audit.events[0], previousHash: "tampered" })}\n`);
      expect(readAuditEvents().chainValid).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exports Prometheus-compatible readiness, run, review, and adapter metrics", () => {
    const root = mkdtempSync(join(tmpdir(), "dta-metrics-"));
    try {
      process.env.DTA_DATA_DIR = root;
      process.env.DTA_AUDIT_LOG_PATH = join(root, "audit.jsonl");
      recordAgentRunFinished({ agentId: "meeting-agent", status: "completed", durationMs: 1_500, inputTokens: 12, outputTokens: 5, cost: 0.01 });
      recordMediaJobFinished({ kind: "video", status: "completed", durationMs: 2_000 });
      recordWorkflowFinished({ workflowId: "meeting-notify-teams", status: "completed", durationMs: 250 });
      const closeSse = beginSseConnection("agent_run", true);
      closeSse();
      const metrics = renderPrometheusMetrics();
      expect(metrics).toContain("# TYPE dta_info gauge");
      expect(metrics).toContain("dta_configuration_ready");
      expect(metrics).toContain("dta_audit_chain_valid 1");
      expect(metrics).toContain('memory_store="local"');
      expect(metrics).toContain('dta_agent_run_finished_total{agent_id="meeting-agent",status="completed"} 1');
      expect(metrics).toContain('dta_agent_tokens_total{agent_id="meeting-agent",direction="input"} 12');
      expect(metrics).toContain('dta_media_job_duration_seconds_count{kind="video",status="completed"} 1');
      expect(metrics).toContain('dta_workflow_execution_total{replayed="false",status="completed",workflow_id="meeting-notify-teams"} 1');
      expect(metrics).toContain('dta_sse_connections_active{stream="agent_run"} 0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
