import { loadDtaConfig, type DtaConfig } from "@/lib/config/env";
import { WorkflowExecutionError, type WorkflowExecutionContext, type WorkflowExecutor } from "./workflow-executor";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export class N8nWorkflowExecutor implements WorkflowExecutor {
  constructor(private readonly config: DtaConfig = loadDtaConfig()) {}

  async execute(workflow: string, payload: unknown, context: WorkflowExecutionContext = {}): Promise<unknown> {
    const endpoint = this.config.n8nWorkflows[workflow];
    if (!endpoint) throw new WorkflowExecutionError(`n8n workflow is not configured: ${workflow}`);
    if (!this.config.n8nBaseUrl) throw new WorkflowExecutionError("N8N_BASE_URL is not configured");
    let url: URL;
    try {
      url = new URL(endpoint, `${this.config.n8nBaseUrl}/`);
    } catch {
      throw new WorkflowExecutionError(`n8n workflow URL is invalid: ${workflow}`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new WorkflowExecutionError("n8n workflow URL must use HTTP or HTTPS");
    }
    let configuredBase: URL;
    try {
      configuredBase = new URL(`${this.config.n8nBaseUrl}/`);
    } catch {
      throw new WorkflowExecutionError("N8N_BASE_URL is invalid");
    }
    if (url.origin !== configuredBase.origin) {
      throw new WorkflowExecutionError("n8n workflow URL must use the configured N8N_BASE_URL origin");
    }
    const headers = new Headers({ "Content-Type": "application/json", Accept: "application/json" });
    if (this.config.n8nApiKey) {
      headers.set(this.config.n8nAuthHeader, `${this.config.n8nAuthScheme} ${this.config.n8nApiKey}`.trim());
    }
    headers.set("X-DTA-Workflow-Id", workflow);
    if (context.executionId) headers.set("X-DTA-Execution-Id", context.executionId);
    if (context.idempotencyKey) headers.set("Idempotency-Key", context.idempotencyKey);
    if (context.runId) headers.set("X-DTA-Run-Id", context.runId);
    if (context.userId) headers.set("X-DTA-User-Id", context.userId);
    if (context.actorId) headers.set("X-DTA-Actor-Id", context.actorId);
    if (context.projectId) headers.set("X-DTA-Project-Id", context.projectId);
    if (context.conversationId) headers.set("X-DTA-Conversation-Id", context.conversationId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.n8nTimeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload ?? null),
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
      });
      const text = await response.text();
      if (!response.ok) throw new WorkflowExecutionError(`n8n workflow ${workflow} failed with HTTP ${response.status}`);
      recordAuditEvent({ action: "workflow.execute", actorId: context.actorId ?? "agent-runtime", resourceType: "n8n_workflow", resourceId: workflow, outcome: "success", metadata: { status: response.status, ...(context.runId ? { runId: context.runId } : {}), ...(context.userId ? { actingUserId: context.userId } : {}) } });
      if (!text.trim()) return { ok: true };
      try { return JSON.parse(text) as unknown; }
      catch { return { ok: true, output: text.slice(0, 100_000) }; }
    } catch (error) {
      recordAuditEvent({ action: "workflow.execute", actorId: context.actorId ?? "agent-runtime", resourceType: "n8n_workflow", resourceId: workflow, outcome: "failure", metadata: { ...(context.runId ? { runId: context.runId } : {}), ...(context.userId ? { actingUserId: context.userId } : {}) } });
      if (error instanceof WorkflowExecutionError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new WorkflowExecutionError(`n8n workflow ${workflow} timed out`);
      throw new WorkflowExecutionError(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
    }
  }
}
