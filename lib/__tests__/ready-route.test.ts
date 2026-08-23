import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../../app/ready/route";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("GET /ready", () => {
  it("is ready with local adapters even when optional media capabilities are disabled", async () => {
    process.env.DTA_AUTH_MODE = "none";
    process.env.DTA_ARTIFACT_STORE = "local";
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_API_KEY;
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ready", service: "dta-agent-platform" });
  });

  it("reports a selected but incomplete company adapter", async () => {
    process.env.DTA_AUTH_MODE = "keycloak";
    delete process.env.KEYCLOAK_ISSUER;
    delete process.env.KEYCLOAK_AUDIENCE;
    const response = await GET();
    const body = await response.json() as { issues: Array<{ code: string }> };
    expect(response.status).toBe(503);
    expect(body.issues.map((issue) => issue.code)).toContain("KEYCLOAK_INCOMPLETE");
  });

  it("rejects an invalid mounted Agent manifest before serving traffic", async () => {
    const root = mkdtempSync(join(tmpdir(), "dta-invalid-manifest-"));
    try {
      const manifest = join(root, "agents.json");
      writeFileSync(manifest, JSON.stringify({ version: 1, agents: [{ id: "invalid" }] }));
      process.env.DTA_AGENT_MANIFEST_PATH = manifest;
      const response = await GET();
      const body = await response.json() as { issues: Array<{ code: string }> };
      expect(response.status).toBe(503);
      expect(body.issues.map((issue) => issue.code)).toContain("AGENT_MANIFEST_INVALID");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
