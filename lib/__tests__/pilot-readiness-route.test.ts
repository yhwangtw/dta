import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../../app/api/admin/pilot-readiness/route";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("GET /api/admin/pilot-readiness", () => {
  it("returns the selected company adapters without returning credentials", async () => {
    process.env.DTA_AUTH_MODE = "none";
    process.env.KEYCLOAK_ISSUER = "https://sso.example.test/realms/company";
    process.env.KEYCLOAK_AUDIENCE = "dta-agent-platform";
    process.env.LLM_BASE_URL = "https://llm.example.test/v1";
    process.env.LLM_MODEL = "company-model";
    process.env.LLM_API_KEY = "llm-secret";
    process.env.DTA_ARTIFACT_STORE = "minio";
    process.env.MINIO_ENDPOINT = "https://minio.example.test";
    process.env.MINIO_ACCESS_KEY = "minio-access";
    process.env.MINIO_SECRET_KEY = "minio-secret";
    process.env.MINIO_BUCKET = "dta-artifacts";
    process.env.DTA_WORKFLOW_PROVIDER = "n8n";
    process.env.DTA_ENABLE_WORKFLOW_TOOLS = "true";
    process.env.N8N_BASE_URL = "https://n8n.example.test";
    process.env.N8N_API_KEY = "n8n-secret";
    process.env.N8N_WORKFLOW_MAP_JSON = JSON.stringify({ "meeting-pilot-readiness": "/webhook/dta-pilot-readiness" });

    const response = await GET(new Request("http://localhost/api/admin/pilot-readiness"));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.adapters).toMatchObject({
      auth: { provider: "none", issuer: "https://sso.example.test/realms/company", audience: "dta-agent-platform" },
      llm: { configured: true, endpoint: "https://llm.example.test/v1", model: "company-model" },
      artifactStore: { provider: "minio", endpoint: "https://minio.example.test", bucket: "dta-artifacts" },
      workflow: { provider: "n8n", enabled: true, configuredWorkflows: ["meeting-pilot-readiness"] },
    });
    expect(serialized).not.toContain("llm-secret");
    expect(serialized).not.toContain("minio-access");
    expect(serialized).not.toContain("minio-secret");
    expect(serialized).not.toContain("n8n-secret");
  });
});
