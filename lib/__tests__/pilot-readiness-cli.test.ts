import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type PilotModule = typeof import("../../scripts/dta-pilot-readiness.mjs");

function jwt(subject: string) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "pilot-key" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "https://sso.example.test/realms/company",
    aud: "dta-agent-platform",
    sub: subject,
    exp: Math.floor(Date.now() / 1_000) + 3_600,
  })).toString("base64url");
  return `${header}.${payload}.signature`;
}

function bearer(init?: RequestInit): string | null {
  return new Headers(init?.headers).get("authorization");
}

describe("DTA company pilot readiness", () => {
  it("packages the readiness client and an inactive no-side-effect n8n probe", () => {
    const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");
    const workflow = JSON.parse(readFileSync(resolve(process.cwd(), "deploy/n8n/dta-pilot-readiness.json"), "utf8"));

    expect(dockerfile).toContain("/app/scripts/dta-pilot-readiness.mjs");
    expect(workflow.active).toBe(false);
    expect(workflow.nodes.map((node: { name: string }) => node.name)).toEqual([
      "DTA Pilot Webhook",
      "Validate DTA Scope",
      "Return Probe Evidence",
    ]);
    expect(JSON.stringify(workflow)).not.toMatch(/jira|teams|wiki/i);
  });

  it("proves the live Keycloak, MinIO, LLM, SSE, ownership, review, and n8n path without leaking tokens", async () => {
    const pilot = await import(new URL("../../scripts/dta-pilot-readiness.mjs", import.meta.url).href) as PilotModule;
    const primaryToken = jwt("user-a");
    const secondaryToken = jwt("user-b");
    let workflowExecution: Record<string, unknown> | undefined;

    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const authorization = bearer(init);
      const secondary = authorization === `Bearer ${secondaryToken}`;
      if (url.pathname === "/health") return Response.json({ status: "ok", service: "dta-agent-platform", configurationReady: true });
      if (url.pathname === "/ready") return Response.json({ status: "ready", service: "dta-agent-platform", issues: [] });
      if (url.pathname.endsWith("/.well-known/openid-configuration")) {
        return Response.json({ issuer: "https://sso.example.test/realms/company", jwks_uri: "https://sso.example.test/realms/company/certs" });
      }
      if (url.pathname.endsWith("/certs")) return Response.json({ keys: [{ kid: "pilot-key", kty: "RSA" }] });
      if (url.pathname === "/api/agents") {
        if (!authorization) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
        return Response.json({ agents: [{ id: "meeting-agent" }, { id: "pm-agent" }] });
      }
      if (url.pathname === "/api/admin/pilot-readiness") {
        return Response.json({
          configurationReady: true,
          issues: [],
          adapters: {
            auth: { provider: "keycloak" },
            llm: { configured: true, model: "company-model" },
            artifactStore: { provider: "minio", bucket: "dta-artifacts" },
            workflow: { provider: "n8n", enabled: true, configuredWorkflows: ["meeting-pilot-readiness"] },
          },
        });
      }
      if (url.pathname === "/api/meeting-agent/extract") {
        return Response.json({ results: [{ ok: true, artifactId: "artifact-1", name: "dta-pilot-readiness.txt", kind: "text" }] });
      }
      if (url.pathname === "/api/artifacts/artifact-1") {
        if (secondary) return Response.json({ error: { code: "RUN_NOT_FOUND" } }, { status: 404 });
        if (init?.method === "DELETE") return new Response(null, { status: 204 });
        return new Response(await pilotMarker(init), { status: 200, headers: { "Content-Type": "text/plain" } });
      }
      if (url.pathname === "/api/agents/meeting/run") {
        return Response.json({ requestId: "request-1", runId: "run-1", agentId: "meeting-agent", status: "running" }, { status: 202 });
      }
      if (url.pathname === "/api/agent-runs/run-1/events") {
        if (secondary) return Response.json({ error: { code: "RUN_NOT_FOUND" } }, { status: 404 });
        return new Response("event: completed\ndata: {\"type\":\"completed\",\"result\":{}}\n\n", { headers: { "Content-Type": "text/event-stream" } });
      }
      if (url.pathname === "/api/agent-runs/run-1") {
        if (secondary) return Response.json({ error: { code: "RUN_NOT_FOUND" } }, { status: 404 });
        return Response.json({
          requestId: "request-1",
          runId: "run-1",
          agentId: "meeting-agent",
          status: "completed",
          review: { status: "needs_review", revision: 1 },
          result: { summary: "Pilot approved.", decisions: [{ text: "Approve pilot" }], actionItems: [], requirements: [{ title: "Isolation", description: "Keep users separate." }] },
          artifacts: [],
        });
      }
      if (url.pathname === "/api/meeting-agent/runs/run-1/review") {
        return Response.json({ meetingRun: { reviewStatus: "approved", revision: 1 } });
      }
      if (url.pathname === "/api/workflows/meeting-pilot-readiness/execute") {
        if (!workflowExecution) {
          workflowExecution = { id: "workflow-execution-1", status: "completed", result: { ok: true, dtaProbe: true } };
          return Response.json({ execution: workflowExecution, replayed: false }, { status: 201 });
        }
        return Response.json({ execution: workflowExecution, replayed: true });
      }
      return Response.json({ error: `Unexpected test request: ${url}` }, { status: 500 });
    });

    async function pilotMarker(init?: RequestInit) {
      const form = fetchImpl.mock.calls.find(([input]) => String(input).includes("/api/meeting-agent/extract"))?.[1]?.body as FormData;
      const file = form?.get("files") as File | null;
      if (!file || file.name !== "dta-pilot-readiness.txt") throw new Error(`Unexpected pilot form body: ${String(init?.body)}`);
      return file.text();
    }

    const report = await pilot.runCompanyPilotReadiness({
      baseUrl: "https://dta.example.test",
      primaryToken,
      secondaryToken,
      live: true,
      timeoutMs: 10_000,
      fetchImpl,
      sleep: async () => {},
    });

    expect(report.status).toBe("passed");
    expect(report.summary).toEqual({ passed: 17, failed: 0, skipped: 0 });
    expect(report.checks.map((check: { id: string }) => check.id)).toEqual(expect.arrayContaining([
      "keycloak.discovery",
      "minio.artifact_roundtrip",
      "llm.structured_result",
      "sse.normalized_events",
      "ownership.run_sse_isolation",
      "n8n.workflow_and_idempotency",
    ]));
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(primaryToken);
    expect(serialized).not.toContain(secondaryToken);
  });

  it("reports an honest incomplete preflight when no Keycloak token is supplied", async () => {
    const pilot = await import(new URL("../../scripts/dta-pilot-readiness.mjs", import.meta.url).href) as PilotModule;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/health") return Response.json({ status: "ok", service: "dta-agent-platform" });
      if (path === "/ready") return Response.json({ status: "ready", issues: [] });
      return Response.json({}, { status: 500 });
    });

    const report = await pilot.runCompanyPilotReadiness({ baseUrl: "https://dta.example.test", fetchImpl });

    expect(report.status).toBe("incomplete");
    expect(report.checks.find((check: { id: string; status: string }) => check.id === "dta.authenticated_api")?.status).toBe("skipped");
  });
});
