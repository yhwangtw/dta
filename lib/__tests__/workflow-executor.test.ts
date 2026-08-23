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

  it("keeps local development deterministic with a mock executor", async () => {
    const executor = new MockWorkflowExecutor();
    await expect(executor.execute("pm-publish-prd", { artifactId: "a1" }))
      .resolves.toEqual({ ok: true, mock: true, workflow: "pm-publish-prd", payload: { artifactId: "a1" } });
  });
});
