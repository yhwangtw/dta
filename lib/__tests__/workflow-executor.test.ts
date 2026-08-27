import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDtaConfig } from "../config/env";
import { N8nWorkflowExecutor } from "../integrations/n8n/n8n-workflow-executor";
import { MockWorkflowExecutor } from "../integrations/n8n/mock-workflow-executor";

afterEach(() => vi.restoreAllMocks());

describe("workflow adapters", () => {
  it("maps logical workflow names to configured n8n webhooks", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ issueKey: "DTA-123" }));
    const config = loadDtaConfig({
      ...process.env,
      DTA_WORKFLOW_PROVIDER: "n8n",
      N8N_BASE_URL: "https://n8n.example.com",
      N8N_API_KEY: "test-key",
      N8N_WORKFLOW_MAP_JSON: JSON.stringify({ "meeting-create-jira": "/webhook/create-jira" }),
    });
    const executor = new N8nWorkflowExecutor(config);
    const result = await executor.execute("meeting-create-jira", { title: "Pilot" });

    expect(result).toEqual({ issueKey: "DTA-123" });
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://n8n.example.com/webhook/create-jira"), expect.objectContaining({ method: "POST" }));
  });

  it("adds DTA execution headers and rejects webhook URLs on another origin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));
    const config = loadDtaConfig({
      ...process.env,
      DTA_WORKFLOW_PROVIDER: "n8n",
      N8N_BASE_URL: "https://n8n.example.com",
      N8N_WORKFLOW_MAP_JSON: JSON.stringify({
        "meeting-create-jira": "/webhook/create-jira",
        "meeting-notify-teams": "https://other.example.com/webhook/notify",
      }),
    });
    const executor = new N8nWorkflowExecutor(config);
    await executor.execute("meeting-create-jira", { title: "Pilot" }, { executionId: "exec-1", idempotencyKey: "idem-1" });

    const request = fetchMock.mock.calls[0][1];
    const headers = new Headers(request?.headers);
    expect(headers.get("X-DTA-Workflow-Id")).toBe("meeting-create-jira");
    expect(headers.get("X-DTA-Execution-Id")).toBe("exec-1");
    expect(headers.get("Idempotency-Key")).toBe("idem-1");
    await expect(executor.execute("meeting-notify-teams", {})).rejects.toThrow("configured N8N_BASE_URL origin");
  });

  it("keeps local development deterministic with a mock executor", async () => {
    const executor = new MockWorkflowExecutor();
    await expect(executor.execute("pm-publish-prd", { artifactId: "a1" }))
      .resolves.toEqual({ ok: true, mock: true, workflow: "pm-publish-prd", payload: { artifactId: "a1" } });
  });
});
