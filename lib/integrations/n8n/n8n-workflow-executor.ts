import { loadDtaConfig, type DtaConfig } from "@/lib/config/env";
import { WorkflowExecutionError, type WorkflowExecutor } from "./workflow-executor";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export class N8nWorkflowExecutor implements WorkflowExecutor {
  constructor(private readonly config: DtaConfig = loadDtaConfig()) {}

  async execute(workflow: string, payload: unknown): Promise<unknown> {
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
    const headers = new Headers({ "Content-Type": "application/json", Accept: "application/json" });
    if (this.config.n8nApiKey) {
      headers.set(this.config.n8nAuthHeader, `${this.config.n8nAuthScheme} ${this.config.n8nApiKey}`.trim());
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.n8nTimeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload ?? null),
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await response.text();
      if (!response.ok) throw new WorkflowExecutionError(`n8n workflow ${workflow} failed with HTTP ${response.status}`);
      recordAuditEvent({ action: "workflow.execute", actorId: "agent-runtime", resourceType: "n8n_workflow", resourceId: workflow, outcome: "success", metadata: { status: response.status } });
      if (!text.trim()) return { ok: true };
      try { return JSON.parse(text) as unknown; }
      catch { return { ok: true, output: text.slice(0, 100_000) }; }
    } catch (error) {
      recordAuditEvent({ action: "workflow.execute", actorId: "agent-runtime", resourceType: "n8n_workflow", resourceId: workflow, outcome: "failure" });
      if (error instanceof WorkflowExecutionError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new WorkflowExecutionError(`n8n workflow ${workflow} timed out`);
      throw new WorkflowExecutionError(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
    }
  }
}
