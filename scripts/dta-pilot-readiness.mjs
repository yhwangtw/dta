import { createHash, randomUUID } from "node:crypto";

export const PILOT_WORKFLOW_ID = "meeting-pilot-readiness";

const TERMINAL_STATUSES = new Set(["completed", "failed", "waiting_for_input"]);

// Health, readiness, the legacy shared-password gate, and protocol discovery
// documents are intentionally public. Every company/user data surface below
// must reject a request before parsing resource identifiers or request bodies.
export const PROTECTED_ROUTE_PROBES = [
  ["GET", "/api/admin/pilot-readiness"],
  ["POST", "/api/admin/retention"],
  ["GET", "/api/agent-runs"],
  ["POST", "/api/agent-runs"],
  ["PATCH", "/api/agent-runs"],
  ["GET", "/api/agent-runs/missing"],
  ["GET", "/api/agent-runs/missing/events"],
  ["POST", "/api/agent-runs/missing/retry"],
  ["POST", "/api/agent-runs/missing/cancel"],
  ["GET", "/api/agent-sessions/missing/metadata"],
  ["GET", "/api/agent/missing"],
  ["POST", "/api/agent/missing"],
  ["POST", "/api/agent/missing/command"],
  ["GET", "/api/agent/missing/context-report"],
  ["GET", "/api/agent/missing/events"],
  ["GET", "/api/agent/missing/extensions"],
  ["POST", "/api/agent/missing/extensions"],
  ["POST", "/api/agent/missing/import"],
  ["POST", "/api/agent/missing/summarize"],
  ["POST", "/api/agent/new"],
  ["GET", "/api/agents"],
  ["POST", "/api/agents/meeting/run"],
  ["POST", "/api/agents/meeting/workspace"],
  ["GET", "/api/artifacts/missing"],
  ["DELETE", "/api/artifacts/missing"],
  ["GET", "/api/attention"],
  ["GET", "/api/audit-events"],
  ["GET", "/api/auth/all-providers"],
  ["GET", "/api/auth/api-key/openai"],
  ["POST", "/api/auth/api-key/openai"],
  ["DELETE", "/api/auth/api-key/openai"],
  ["GET", "/api/auth/me"],
  ["GET", "/api/auth/providers"],
  ["POST", "/api/auth/login/openai"],
  ["GET", "/api/auth/login/openai"],
  ["POST", "/api/auth/logout/openai"],
  ["DELETE", "/api/conversations/missing/memory"],
  ["GET", "/api/department-agent/runs"],
  ["POST", "/api/department-agent/runs/missing/review"],
  ["POST", "/api/cwd/browse"],
  ["POST", "/api/cwd/validate"],
  ["POST", "/api/default-cwd"],
  ["GET", "/api/files/missing"],
  ["PUT", "/api/files/missing"],
  ["POST", "/api/files/missing"],
  ["DELETE", "/api/files/missing"],
  ["GET", "/api/files/grep"],
  ["GET", "/api/files/insights"],
  ["GET", "/api/files/search"],
  ["GET", "/api/git/changes"],
  ["POST", "/api/git/commit"],
  ["GET", "/api/git/file-diff"],
  ["GET", "/api/git/file-hunks"],
  ["POST", "/api/git/file-hunks"],
  ["GET", "/api/git/snapshots"],
  ["POST", "/api/git/snapshots"],
  ["GET", "/api/git/snapshots/file"],
  ["POST", "/api/git/snapshots/restore"],
  ["GET", "/api/home"],
  ["POST", "/api/meeting-agent/extract", "form"],
  ["GET", "/api/meeting-agent/media-jobs"],
  ["GET", "/api/meeting-agent/media-jobs/missing"],
  ["POST", "/api/meeting-agent/media-jobs/missing"],
  ["DELETE", "/api/meeting-agent/media-jobs/missing"],
  ["GET", "/api/meeting-agent/runs"],
  ["POST", "/api/meeting-agent/runs/missing/review"],
  ["POST", "/api/meeting-agent/workspace"],
  ["GET", "/api/models-config"],
  ["PUT", "/api/models-config"],
  ["POST", "/api/models-config/test"],
  ["GET", "/api/models"],
  ["POST", "/api/models"],
  ["GET", "/api/packages"],
  ["POST", "/api/packages"],
  ["POST", "/api/pm-agent/workspace"],
  ["GET", "/api/pm-agent/runs"],
  ["POST", "/api/pm-agent/runs/missing/review"],
  ["GET", "/api/projects/discover"],
  ["GET", "/api/prompts"],
  ["POST", "/api/prompts"],
  ["DELETE", "/api/prompts"],
  ["GET", "/api/provider-health"],
  ["GET", "/api/push"],
  ["POST", "/api/push"],
  ["DELETE", "/api/push"],
  ["GET", "/api/schedules"],
  ["POST", "/api/schedules"],
  ["PATCH", "/api/schedules/missing"],
  ["DELETE", "/api/schedules/missing"],
  ["POST", "/api/schedules/missing/run"],
  ["GET", "/api/schedules/wake"],
  ["POST", "/api/schedules/wake"],
  ["GET", "/api/search/semantic"],
  ["GET", "/api/sessions"],
  ["GET", "/api/sessions/missing"],
  ["PATCH", "/api/sessions/missing"],
  ["DELETE", "/api/sessions/missing"],
  ["POST", "/api/sessions/missing/clone"],
  ["GET", "/api/sessions/missing/context"],
  ["GET", "/api/sessions/missing/export"],
  ["GET", "/api/sessions/missing/export-md"],
  ["GET", "/api/sessions/analytics"],
  ["GET", "/api/sessions/archive"],
  ["POST", "/api/sessions/archive"],
  ["DELETE", "/api/sessions/archive"],
  ["GET", "/api/sessions/pins"],
  ["POST", "/api/sessions/pins"],
  ["DELETE", "/api/sessions/pins"],
  ["GET", "/api/sessions/search"],
  ["GET", "/api/sessions/tags"],
  ["POST", "/api/sessions/tags"],
  ["DELETE", "/api/sessions/tags"],
  ["GET", "/api/skills"],
  ["PATCH", "/api/skills"],
  ["POST", "/api/skills/install"],
  ["POST", "/api/skills/search"],
  ["GET", "/api/tgd/artifacts"],
  ["GET", "/api/workflows?agentId=meeting-agent"],
  ["POST", "/api/workflows/missing/execute"],
  ["GET", "/api/worktrees"],
];

function cleanBaseUrl(value) {
  return String(value || "http://127.0.0.1:30141").replace(/\/+$/, "");
}

function safeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function decodeJwt(token) {
  const segments = String(token || "").split(".");
  if (segments.length !== 3) throw new Error("Access token is not a JWT");
  try {
    const header = JSON.parse(Buffer.from(segments[0], "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    if (!header || typeof header !== "object" || !claims || typeof claims !== "object") throw new Error("invalid token payload");
    return { header, claims };
  } catch {
    throw new Error("Access token JWT payload is invalid");
  }
}

function claimAudience(claim) {
  return typeof claim === "string" ? [claim] : Array.isArray(claim) ? claim.filter((item) => typeof item === "string") : [];
}

function claimRoles(claims) {
  const roles = new Set();
  const realmRoles = claims?.realm_access?.roles;
  if (Array.isArray(realmRoles)) for (const role of realmRoles) if (typeof role === "string") roles.add(role);
  const resources = claims?.resource_access;
  if (resources && typeof resources === "object") {
    for (const resource of Object.values(resources)) {
      if (!resource || typeof resource !== "object" || !Array.isArray(resource.roles)) continue;
      for (const role of resource.roles) if (typeof role === "string") roles.add(role);
    }
  }
  return [...roles].sort();
}

function tokenEvidence(token) {
  const { header, claims } = decodeJwt(token);
  if (header.alg !== "RS256") throw new Error(`Token algorithm must be RS256, received ${String(header.alg || "missing")}`);
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("Token subject is missing");
  if (typeof claims.iss !== "string" || !claims.iss) throw new Error("Token issuer is missing");
  if (typeof claims.exp !== "number") throw new Error("Token expiry is missing");
  const expiresAt = new Date(claims.exp * 1_000);
  if (expiresAt.getTime() <= Date.now()) throw new Error("Access token is expired");
  return {
    issuer: claims.iss.replace(/\/+$/, ""),
    audience: claimAudience(claims.aud),
    roles: claimRoles(claims),
    expiresAt: expiresAt.toISOString(),
    subjectHash: sha256(claims.sub).slice(0, 16),
    keyId: typeof header.kid === "string" ? header.kid : undefined,
  };
}

async function responsePayload(response) {
  const text = await response.text();
  if (!text) return { text: "", body: null };
  try { return { text, body: JSON.parse(text) }; }
  catch { return { text, body: null }; }
}

function responseError(response, payload) {
  const candidate = payload?.body?.error;
  const message = typeof candidate === "string" ? candidate
    : candidate && typeof candidate.message === "string" ? candidate.message
      : payload?.text?.slice(0, 300) || response.statusText;
  return `HTTP ${response.status}${message ? `: ${message}` : ""}`;
}

function authHeaders(token, json = false) {
  return {
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function jsonRequest(fetchImpl, url, { token, method = "GET", body, headers = {}, expected = [200] } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: { ...authHeaders(token, body !== undefined), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await responsePayload(response);
  if (!expected.includes(response.status)) throw new Error(responseError(response, payload));
  return { response, body: payload.body, text: payload.text };
}

async function rawRequest(fetchImpl, url, { token, method = "GET", body, headers = {}, expected = [200] } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: { ...authHeaders(token), ...headers },
    ...(body !== undefined ? { body } : {}),
  });
  if (!expected.includes(response.status)) {
    const payload = await responsePayload(response);
    throw new Error(responseError(response, payload));
  }
  return response;
}

async function verifyUnauthenticatedRouteMatrix(fetchImpl, baseUrl) {
  const failures = [];
  for (const [method, path, bodyType] of PROTECTED_ROUTE_PROBES) {
    const headers = { Accept: "application/json" };
    let body;
    if (method !== "GET") {
      if (bodyType === "form") body = new FormData();
      else {
        headers["Content-Type"] = "application/json";
        body = "{}";
      }
    }
    const response = await fetchImpl(`${baseUrl}${path}`, { method, headers, ...(body !== undefined ? { body } : {}), redirect: "manual" });
    if (response.status !== 401) failures.push(`${method} ${path} -> ${response.status}`);
  }
  if (failures.length) throw new Error(`Protected route authentication failed: ${failures.join("; ")}`);
  return { protectedHandlers: PROTECTED_ROUTE_PROBES.length, expectedStatus: 401 };
}

function requiredAdapterProblems(configuration, workflowId) {
  const adapters = configuration?.adapters ?? {};
  const problems = [];
  if (adapters.auth?.provider !== "keycloak") problems.push("Keycloak authentication is not selected");
  if (!adapters.llm?.configured) problems.push("Company LLM is not fully configured");
  if (adapters.artifactStore?.provider !== "minio") problems.push("MinIO artifact storage is not selected");
  if (adapters.workflow?.provider !== "n8n") problems.push("n8n workflow provider is not selected");
  if (!adapters.workflow?.configuredWorkflows?.includes(workflowId)) problems.push(`${workflowId} is not configured`);
  return problems;
}

function structuredMeetingResult(response) {
  const result = response?.result;
  const traceable = (item) => item && typeof item === "object"
    && typeof item.id === "string" && item.id.length > 0
    && Array.isArray(item.evidence)
    && typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1
    && typeof item.needsConfirmation === "boolean";
  return Boolean(
    response?.status === "completed"
    && result && typeof result === "object"
    && result.schemaVersion === "2.0"
    && typeof result.summary === "string" && result.summary.trim()
    && Array.isArray(result.decisions) && result.decisions.every(traceable)
    && Array.isArray(result.actionItems) && result.actionItems.every(traceable)
    && Array.isArray(result.requirements) && result.requirements.every(traceable),
  );
}

async function readSse(response, timeoutMs) {
  if (!response.ok || !response.body) throw new Error(`SSE returned HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
    throw new Error("SSE endpoint did not return text/event-stream");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(1, deadline - Date.now());
      let timer;
      const result = await Promise.race([
        reader.read(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("SSE stream timed out")), remaining); }),
      ]).finally(() => clearTimeout(timer));
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        if (!block.trim() || block.trimStart().startsWith(":")) continue;
        let event = "message";
        const data = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        }
        let payload;
        try { payload = JSON.parse(data.join("\n")); }
        catch { payload = data.join("\n"); }
        events.push({ event, data: payload });
        const type = payload && typeof payload === "object" ? payload.type : event;
        if (type === "completed" || type === "failed" || type === "waiting_for_input") return events;
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* stream already closed */ }
  }
  return events;
}

async function waitForRun(fetchImpl, baseUrl, token, runId, timeoutMs, sleep) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { body } = await jsonRequest(fetchImpl, `${baseUrl}/api/agent-runs/${encodeURIComponent(runId)}`, { token });
    if (TERMINAL_STATUSES.has(body?.status)) return body;
    await sleep(Math.min(1_000, Math.max(1, deadline - Date.now())));
  }
  throw new Error("Agent run did not finish before the pilot timeout");
}

function reportStatus(checks) {
  if (checks.some((check) => check.required && check.status === "failed")) return "failed";
  if (checks.some((check) => check.required && check.status === "skipped")) return "incomplete";
  return "passed";
}

export async function runCompanyPilotReadiness(options = {}) {
  const baseUrl = cleanBaseUrl(options.baseUrl);
  const primaryToken = options.primaryToken;
  const secondaryToken = options.secondaryToken;
  const live = Boolean(options.live);
  const workflowId = options.workflowId || PILOT_WORKFLOW_ID;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 180_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const checks = [];
  const state = {};

  const addSkipped = (definition, message) => {
    checks.push({ ...definition, status: "skipped", durationMs: 0, message });
    options.onProgress?.(checks.at(-1));
  };
  const runCheck = async (definition, check) => {
    const checkStarted = Date.now();
    try {
      const output = await check();
      const evidence = output && typeof output === "object" ? output : undefined;
      checks.push({
        ...definition,
        status: "passed",
        durationMs: Date.now() - checkStarted,
        message: definition.successMessage,
        ...(evidence ? { evidence } : {}),
      });
    } catch (error) {
      checks.push({
        ...definition,
        status: "failed",
        durationMs: Date.now() - checkStarted,
        message: safeMessage(error),
      });
    }
    options.onProgress?.(checks.at(-1));
    return checks.at(-1)?.status === "passed";
  };

  await runCheck({ id: "dta.health", category: "dta", name: "DTA liveness", required: true, successMessage: "DTA health endpoint is live" }, async () => {
    const { body } = await jsonRequest(fetchImpl, `${baseUrl}/health`, { token: primaryToken });
    if (body?.status !== "ok") throw new Error("Health endpoint did not report ok");
    return { service: body.service, configurationReady: body.configurationReady };
  });

  await runCheck({ id: "dta.readiness", category: "dta", name: "DTA readiness", required: true, successMessage: "DTA readiness endpoint passed" }, async () => {
    const { body } = await jsonRequest(fetchImpl, `${baseUrl}/ready`, { token: primaryToken });
    if (body?.status !== "ready") throw new Error("Readiness endpoint did not report ready");
    return { issueCount: Array.isArray(body.issues) ? body.issues.length : 0 };
  });

  if (!primaryToken) {
    addSkipped({ id: "keycloak.token", category: "keycloak", name: "Primary Keycloak token", required: true }, "DTA_ACCESS_TOKEN or --token is required");
    addSkipped({ id: "keycloak.discovery", category: "keycloak", name: "Keycloak discovery and JWKS", required: true }, "Primary token is unavailable");
    addSkipped({ id: "dta.authenticated_api", category: "keycloak", name: "Authenticated DTA API", required: true }, "Primary token is unavailable");
    addSkipped({ id: "dta.auth_rejection", category: "keycloak", name: "Unauthenticated API rejection", required: true }, "Primary token is unavailable");
    addSkipped({ id: "dta.admin_configuration", category: "configuration", name: "Company adapter selection", required: true }, "Primary token is unavailable");
  } else {
    await runCheck({ id: "keycloak.token", category: "keycloak", name: "Primary Keycloak token", required: true, successMessage: "Primary token is a current RS256 Keycloak JWT" }, async () => {
      state.primaryToken = tokenEvidence(primaryToken);
      return state.primaryToken;
    });

    if (state.primaryToken) {
      await runCheck({ id: "keycloak.discovery", category: "keycloak", name: "Keycloak discovery and JWKS", required: true, successMessage: "Keycloak discovery and signing keys are reachable" }, async () => {
        const discoveryUrl = `${state.primaryToken.issuer}/.well-known/openid-configuration`;
        const { body: discovery } = await jsonRequest(fetchImpl, discoveryUrl);
        if (discovery?.issuer !== state.primaryToken.issuer || typeof discovery?.jwks_uri !== "string") {
          throw new Error("Keycloak discovery metadata does not match the token issuer");
        }
        const { body: jwks } = await jsonRequest(fetchImpl, discovery.jwks_uri);
        const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
        if (!keys.some((key) => key?.kty === "RSA" && (!state.primaryToken.keyId || key.kid === state.primaryToken.keyId))) {
          throw new Error("Keycloak JWKS does not contain the token signing key");
        }
        return { issuer: discovery.issuer, jwksHost: new URL(discovery.jwks_uri).host, matchingSigningKey: true };
      });
    } else {
      addSkipped({ id: "keycloak.discovery", category: "keycloak", name: "Keycloak discovery and JWKS", required: true }, "Primary token validation failed");
    }

    await runCheck({ id: "dta.authenticated_api", category: "keycloak", name: "Authenticated DTA API", required: true, successMessage: "Keycloak token is accepted by DTA and Meeting Agent is enabled" }, async () => {
      const { body } = await jsonRequest(fetchImpl, `${baseUrl}/api/agents`, { token: primaryToken });
      const ids = Array.isArray(body?.agents) ? body.agents.map((agent) => agent?.id).filter(Boolean) : [];
      if (!ids.includes("meeting-agent")) throw new Error("Meeting Agent is not enabled");
      return { enabledAgentIds: ids };
    });

    await runCheck({ id: "dta.auth_rejection", category: "keycloak", name: "Protected route authentication matrix", required: true, successMessage: "Every protected HTTP handler rejects unauthenticated access" }, async () => (
      verifyUnauthenticatedRouteMatrix(fetchImpl, baseUrl)
    ));

    await runCheck({ id: "dta.admin_configuration", category: "configuration", name: "Company adapter selection", required: true, successMessage: "Keycloak, company LLM, MinIO, and n8n are selected" }, async () => {
      const { body } = await jsonRequest(fetchImpl, `${baseUrl}/api/admin/pilot-readiness`, { token: primaryToken });
      const problems = requiredAdapterProblems(body, workflowId);
      if (problems.length) throw new Error(problems.join("; "));
      state.configuration = body;
      return {
        configurationReady: body.configurationReady,
        adapters: body.adapters,
        issueCodes: Array.isArray(body.issues) ? body.issues.map((issue) => issue.code) : [],
      };
    });
  }

  if (!live) {
    const finishedAt = new Date().toISOString();
    return finalizeReport({ baseUrl, workflowId, live, startedAt, finishedAt, durationMs: Date.now() - started, checks });
  }

  if (!primaryToken) {
    for (const definition of liveDefinitions()) addSkipped(definition, "Live checks require a primary token");
    const finishedAt = new Date().toISOString();
    return finalizeReport({ baseUrl, workflowId, live, startedAt, finishedAt, durationMs: Date.now() - started, checks });
  }

  await runCheck({ id: "minio.artifact_roundtrip", category: "minio", name: "MinIO artifact round trip", required: true, successMessage: "Artifact upload, download, ownership metadata, and bytes round trip passed" }, async () => {
    const marker = `DTA pilot readiness ${randomUUID()}`;
    const form = new FormData();
    form.append("projectId", "dta-pilot-readiness");
    form.append("conversationId", `pilot-${randomUUID()}`);
    form.append("files", new File([marker], "dta-pilot-readiness.txt", { type: "text/plain" }));
    const upload = await rawRequest(fetchImpl, `${baseUrl}/api/meeting-agent/extract`, {
      token: primaryToken,
      method: "POST",
      body: form,
      expected: [200],
    });
    const uploaded = await responsePayload(upload);
    const result = uploaded.body?.results?.[0];
    if (!result?.ok || typeof result.artifactId !== "string") throw new Error(result?.error || "Pilot artifact upload did not return an artifact id");
    state.artifactId = result.artifactId;
    state.artifactMarker = marker;
    const download = await rawRequest(fetchImpl, `${baseUrl}/api/artifacts/${encodeURIComponent(result.artifactId)}`, { token: primaryToken });
    const downloaded = await download.text();
    if (downloaded !== marker) throw new Error("Downloaded artifact bytes do not match the uploaded bytes");
    return { artifactId: result.artifactId, bytes: Buffer.byteLength(marker), scanStatus: result.uploadScanStatus };
  });

  if (!secondaryToken) {
    addSkipped({ id: "keycloak.secondary_token", category: "keycloak", name: "Secondary Keycloak identity", required: true }, "DTA_SECONDARY_ACCESS_TOKEN or --secondary-token is required for cross-user isolation");
    addSkipped({ id: "ownership.artifact_isolation", category: "ownership", name: "Cross-user artifact isolation", required: true }, "Secondary token is unavailable");
  } else {
    await runCheck({ id: "keycloak.secondary_token", category: "keycloak", name: "Secondary Keycloak identity", required: true, successMessage: "Secondary token is current and belongs to another Keycloak subject" }, async () => {
      const secondary = tokenEvidence(secondaryToken);
      if (secondary.subjectHash === state.primaryToken?.subjectHash) throw new Error("Primary and secondary tokens belong to the same Keycloak subject");
      state.secondaryToken = secondary;
      return secondary;
    });

    if (state.artifactId) {
      await runCheck({ id: "ownership.artifact_isolation", category: "ownership", name: "Cross-user artifact isolation", required: true, successMessage: "User B cannot read User A's artifact" }, async () => {
        const response = await fetchImpl(`${baseUrl}/api/artifacts/${encodeURIComponent(state.artifactId)}`, { headers: authHeaders(secondaryToken) });
        if (response.status !== 404) throw new Error(`Expected User B artifact access to return 404, received ${response.status}`);
        return { deniedStatus: response.status };
      });
    } else {
      addSkipped({ id: "ownership.artifact_isolation", category: "ownership", name: "Cross-user artifact isolation", required: true }, "Artifact round trip did not produce an artifact");
    }
  }

  await runCheck({ id: "llm.meeting_run", category: "llm", name: "Company LLM Meeting run", required: true, successMessage: "Company LLM completed a structured Meeting Agent run" }, async () => {
    const requestId = `pilot-${randomUUID()}`;
    const { body } = await jsonRequest(fetchImpl, `${baseUrl}/api/agents/meeting/run`, {
      token: primaryToken,
      method: "POST",
      expected: [200, 202],
      body: {
        requestId,
        conversationId: requestId,
        projectId: "dta-pilot-readiness",
        task: "Create concise structured meeting minutes for this pilot-readiness transcript. Preserve the evidence and do not invoke downstream workflows.",
        input: {
          title: `DTA Pilot Readiness ${startedAt}`,
          outputLanguage: "English",
          transcript: "[00:00] Alex: We approve the DTA company pilot readiness probe. [00:05] Jamie owns the connectivity evidence and will finish it by 2026-09-05. [00:10] Requirement: the platform must preserve user isolation and idempotent workflow execution.",
        },
      },
    });
    if (typeof body?.runId !== "string") throw new Error("Meeting Agent did not return a run id");
    state.runId = body.runId;
    state.requestId = requestId;
    return { runId: body.runId, requestId, acceptedStatus: body.status };
  });

  if (state.runId) {
    await runCheck({ id: "sse.normalized_events", category: "sse", name: "Normalized SSE events", required: true, successMessage: "Authenticated SSE delivered normalized run events" }, async () => {
      const response = await fetchImpl(`${baseUrl}/api/agent-runs/${encodeURIComponent(state.runId)}/events`, {
        headers: { ...authHeaders(primaryToken), Accept: "text/event-stream" },
      });
      const events = await readSse(response, timeoutMs);
      state.sseEvents = events;
      const types = [...new Set(events.map((event) => event?.data?.type || event.event).filter(Boolean))];
      if (!types.some((type) => type === "completed" || type === "failed" || type === "waiting_for_input")) {
        throw new Error("SSE stream did not reach a terminal normalized event");
      }
      return { eventTypes: types, eventCount: events.length };
    });

    await runCheck({ id: "llm.structured_result", category: "llm", name: "Meeting structured result", required: true, successMessage: "Meeting result contains summary, decisions, action items, and requirements" }, async () => {
      const result = await waitForRun(fetchImpl, baseUrl, primaryToken, state.runId, timeoutMs, sleep);
      state.run = result;
      if (!structuredMeetingResult(result)) {
        throw new Error(result?.error?.message || `Meeting Agent finished with invalid status/result: ${String(result?.status || "unknown")}`);
      }
      return {
        status: result.status,
        reviewStatus: result.review?.status,
        decisions: result.result.decisions.length,
        actionItems: result.result.actionItems.length,
        requirements: result.result.requirements.length,
        artifactCount: Array.isArray(result.artifacts) ? result.artifacts.length : 0,
      };
    });

    if (secondaryToken && state.secondaryToken) {
      await runCheck({ id: "ownership.run_sse_isolation", category: "ownership", name: "Cross-user run and SSE isolation", required: true, successMessage: "User B cannot read User A's run or SSE stream" }, async () => {
        const [runResponse, eventsResponse] = await Promise.all([
          fetchImpl(`${baseUrl}/api/agent-runs/${encodeURIComponent(state.runId)}`, { headers: authHeaders(secondaryToken) }),
          fetchImpl(`${baseUrl}/api/agent-runs/${encodeURIComponent(state.runId)}/events`, { headers: { ...authHeaders(secondaryToken), Accept: "text/event-stream" } }),
        ]);
        if (runResponse.status !== 404 || eventsResponse.status !== 404) {
          throw new Error(`Expected User B run/SSE access to return 404/404, received ${runResponse.status}/${eventsResponse.status}`);
        }
        return { runStatus: runResponse.status, sseStatus: eventsResponse.status };
      });

      await runCheck({ id: "ownership.surface_matrix", category: "ownership", name: "Cross-user API surface matrix", required: true, successMessage: "User B cannot observe or mutate User A's session-scoped state" }, async () => {
        const { body: runList } = await jsonRequest(fetchImpl, `${baseUrl}/api/agent-runs?limit=200`, { token: primaryToken });
        const rawRun = Array.isArray(runList?.runs) ? runList.runs.find((run) => run?.id === state.runId) : null;
        const sessionId = rawRun?.sessionId;
        if (typeof sessionId !== "string" || !sessionId) throw new Error("Pilot run does not expose its owned Pi session id");

        const denied = [
          ["GET", `/api/sessions/${encodeURIComponent(sessionId)}`],
          ["GET", `/api/agent-sessions/${encodeURIComponent(sessionId)}/metadata`],
          ["GET", `/api/agent/${encodeURIComponent(sessionId)}`],
          ["GET", `/api/agent/${encodeURIComponent(sessionId)}/events`],
          ["GET", `/api/workflows?agentId=meeting-agent&sourceRunId=${encodeURIComponent(state.runId)}`],
        ];
        for (const [method, path] of denied) {
          const response = await fetchImpl(`${baseUrl}${path}`, { method, headers: authHeaders(secondaryToken), redirect: "manual" });
          if (response.status !== 404) throw new Error(`Expected User B ${method} ${path} to return 404, received ${response.status}`);
        }
        for (const [path, body] of [
          ["/api/sessions/tags", { id: sessionId, tag: "pilot-private" }],
          ["/api/sessions/pins", { id: sessionId }],
          ["/api/sessions/archive", { id: sessionId }],
          [`/api/meeting-agent/runs/${encodeURIComponent(state.runId)}/review`, { decision: "approved" }],
        ]) {
          const response = await fetchImpl(`${baseUrl}${path}`, {
            method: "POST",
            headers: authHeaders(secondaryToken, true),
            body: JSON.stringify(body),
          });
          if (response.status !== 404) throw new Error(`Expected User B POST ${path} to return 404, received ${response.status}`);
        }

        const [{ body: sessions }, { body: meetings }, { body: attention }] = await Promise.all([
          jsonRequest(fetchImpl, `${baseUrl}/api/sessions`, { token: secondaryToken }),
          jsonRequest(fetchImpl, `${baseUrl}/api/meeting-agent/runs`, { token: secondaryToken }),
          jsonRequest(fetchImpl, `${baseUrl}/api/attention`, { token: secondaryToken }),
        ]);
        if (sessions?.sessions?.some((session) => session?.id === sessionId)) throw new Error("User B session listing contains User A's session");
        if (meetings?.runs?.some((run) => run?.runId === state.runId)) throw new Error("User B Meeting listing contains User A's run");
        if (attention?.items?.some((item) => item?.sessionId === sessionId || String(item?.id || "").includes(state.runId))) {
          throw new Error("User B attention center contains User A's work");
        }

        const promptId = `pilot-${randomUUID()}`;
        try {
          await jsonRequest(fetchImpl, `${baseUrl}/api/prompts`, {
            token: primaryToken,
            method: "POST",
            body: { id: promptId, name: "pilot-private", body: "Private pilot prompt" },
          });
          const [{ body: ownerPrompts }, { body: otherPrompts }] = await Promise.all([
            jsonRequest(fetchImpl, `${baseUrl}/api/prompts`, { token: primaryToken }),
            jsonRequest(fetchImpl, `${baseUrl}/api/prompts`, { token: secondaryToken }),
          ]);
          if (!ownerPrompts?.prompts?.some((prompt) => prompt?.id === promptId)) throw new Error("User A cannot read the prompt it created");
          if (otherPrompts?.prompts?.some((prompt) => prompt?.id === promptId)) throw new Error("User B can read User A's prompt");
        } finally {
          await jsonRequest(fetchImpl, `${baseUrl}/api/prompts`, {
            token: primaryToken,
            method: "DELETE",
            body: { id: promptId },
          }).catch(() => {});
        }
        return { runId: state.runId, sessionId, deniedOwnerRoutes: denied.length + 4, isolatedListings: 4 };
      });

      await runCheck({ id: "ownership.standard_user_boundaries", category: "ownership", name: "Standard-user Coding boundary", required: true, successMessage: "A standard company user cannot access Coding, File, Git, or Schedule surfaces" }, async () => {
        const { body: identity } = await jsonRequest(fetchImpl, `${baseUrl}/api/auth/me`, { token: secondaryToken });
        if (identity?.capabilities?.codingWorkspace !== false) {
          throw new Error("Secondary pilot identity must be a standard user without Coding access");
        }
        const probes = [
          "/api/files/search?q=pilot",
          "/api/git/changes",
          "/api/schedules",
        ];
        for (const path of probes) {
          const response = await fetchImpl(`${baseUrl}${path}`, { headers: authHeaders(secondaryToken), redirect: "manual" });
          if (response.status !== 403) throw new Error(`Expected User B GET ${path} to return 403, received ${response.status}`);
        }
        return { codingWorkspace: false, deniedSurfaces: probes.length };
      });
    } else {
      addSkipped({ id: "ownership.run_sse_isolation", category: "ownership", name: "Cross-user run and SSE isolation", required: true }, "Secondary token is unavailable or invalid");
      addSkipped({ id: "ownership.surface_matrix", category: "ownership", name: "Cross-user API surface matrix", required: true }, "Secondary token is unavailable or invalid");
      addSkipped({ id: "ownership.standard_user_boundaries", category: "ownership", name: "Standard-user Coding boundary", required: true }, "Secondary token is unavailable or invalid");
    }
  } else {
    addSkipped({ id: "sse.normalized_events", category: "sse", name: "Normalized SSE events", required: true }, "Meeting run was not created");
    addSkipped({ id: "llm.structured_result", category: "llm", name: "Meeting structured result", required: true }, "Meeting run was not created");
    addSkipped({ id: "ownership.run_sse_isolation", category: "ownership", name: "Cross-user run and SSE isolation", required: true }, "Meeting run was not created");
    addSkipped({ id: "ownership.surface_matrix", category: "ownership", name: "Cross-user API surface matrix", required: true }, "Meeting run was not created");
    addSkipped({ id: "ownership.standard_user_boundaries", category: "ownership", name: "Standard-user Coding boundary", required: true }, "Meeting run was not created");
  }

  if (state.run?.status === "completed") {
    await runCheck({ id: "meeting.review_gate", category: "governance", name: "Meeting review gate", required: true, successMessage: "Pilot Meeting result was explicitly approved" }, async () => {
      const { body } = await jsonRequest(fetchImpl, `${baseUrl}/api/meeting-agent/runs/${encodeURIComponent(state.runId)}/review`, {
        token: primaryToken,
        method: "POST",
        expected: [200],
        body: { decision: "approved", comment: "Approved by the automated company pilot readiness suite." },
      });
      if (body?.meetingRun?.reviewStatus !== "approved") throw new Error("Meeting review did not reach approved status");
      return { reviewStatus: body.meetingRun.reviewStatus, revision: body.meetingRun.revision };
    });
  } else {
    addSkipped({ id: "meeting.review_gate", category: "governance", name: "Meeting review gate", required: true }, "Meeting result is not completed");
  }

  if (checks.find((check) => check.id === "meeting.review_gate")?.status === "passed") {
    await runCheck({ id: "n8n.workflow_and_idempotency", category: "n8n", name: "n8n scope and idempotency", required: true, successMessage: "Review-gated n8n probe passed and replayed idempotently" }, async () => {
      const idempotencyKey = `dta-pilot:${state.runId}:${workflowId}`;
      const execute = () => jsonRequest(fetchImpl, `${baseUrl}/api/workflows/${encodeURIComponent(workflowId)}/execute`, {
        token: primaryToken,
        method: "POST",
        expected: [200, 201],
        headers: { "Idempotency-Key": idempotencyKey },
        body: {
          agentId: "meeting-agent",
          sourceRunId: state.runId,
          reason: "Company pilot readiness probe; the n8n workflow must validate DTA scope headers and cause no business side effects.",
        },
      });
      const first = (await execute()).body;
      if (first?.execution?.status !== "completed" || first?.execution?.result?.ok !== true || first?.execution?.result?.dtaProbe !== true) {
        throw new Error("n8n probe must return {ok:true,dtaProbe:true} through DTA");
      }
      const second = (await execute()).body;
      if (second?.replayed !== true || second?.execution?.id !== first.execution.id) {
        throw new Error("Repeated n8n probe did not reuse the completed idempotent execution");
      }
      return { workflowId, executionId: first.execution.id, replayed: true };
    });
  } else {
    addSkipped({ id: "n8n.workflow_and_idempotency", category: "n8n", name: "n8n scope and idempotency", required: true }, "Meeting review gate did not pass");
  }

  if (state.artifactId) {
    await runCheck({ id: "minio.pilot_cleanup", category: "minio", name: "Pilot artifact cleanup", required: true, successMessage: "Pilot artifact was deleted after verification" }, async () => {
      await rawRequest(fetchImpl, `${baseUrl}/api/artifacts/${encodeURIComponent(state.artifactId)}`, {
        token: primaryToken,
        method: "DELETE",
        expected: [204],
      });
      return { artifactId: state.artifactId, deleted: true };
    });
  } else {
    addSkipped({ id: "minio.pilot_cleanup", category: "minio", name: "Pilot artifact cleanup", required: true }, "No pilot artifact was created");
  }

  const finishedAt = new Date().toISOString();
  return finalizeReport({ baseUrl, workflowId, live, startedAt, finishedAt, durationMs: Date.now() - started, checks });
}

function liveDefinitions() {
  return [
    { id: "minio.artifact_roundtrip", category: "minio", name: "MinIO artifact round trip", required: true },
    { id: "keycloak.secondary_token", category: "keycloak", name: "Secondary Keycloak identity", required: true },
    { id: "ownership.artifact_isolation", category: "ownership", name: "Cross-user artifact isolation", required: true },
    { id: "llm.meeting_run", category: "llm", name: "Company LLM Meeting run", required: true },
    { id: "sse.normalized_events", category: "sse", name: "Normalized SSE events", required: true },
    { id: "llm.structured_result", category: "llm", name: "Meeting structured result", required: true },
    { id: "ownership.run_sse_isolation", category: "ownership", name: "Cross-user run and SSE isolation", required: true },
    { id: "ownership.surface_matrix", category: "ownership", name: "Cross-user API surface matrix", required: true },
    { id: "ownership.standard_user_boundaries", category: "ownership", name: "Standard-user Coding boundary", required: true },
    { id: "meeting.review_gate", category: "governance", name: "Meeting review gate", required: true },
    { id: "n8n.workflow_and_idempotency", category: "n8n", name: "n8n scope and idempotency", required: true },
    { id: "minio.pilot_cleanup", category: "minio", name: "Pilot artifact cleanup", required: true },
  ];
}

function finalizeReport(input) {
  const status = reportStatus(input.checks);
  return {
    schemaVersion: "1.0",
    service: "dta-agent-platform",
    profile: input.live ? "company-pilot-live" : "company-pilot-preflight",
    status,
    baseUrl: input.baseUrl,
    workflowId: input.workflowId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: input.durationMs,
    summary: {
      passed: input.checks.filter((check) => check.status === "passed").length,
      failed: input.checks.filter((check) => check.status === "failed").length,
      skipped: input.checks.filter((check) => check.status === "skipped").length,
    },
    checks: input.checks.map(({ successMessage: _successMessage, ...check }) => check),
  };
}

export function formatPilotReadinessReport(report) {
  const mark = (status) => status === "passed" ? "PASS" : status === "failed" ? "FAIL" : "SKIP";
  const lines = [
    `DTA Company Pilot Readiness · ${report.status.toUpperCase()}`,
    `${report.profile} · ${report.baseUrl}`,
    `Passed ${report.summary.passed} · Failed ${report.summary.failed} · Skipped ${report.summary.skipped}`,
    "",
  ];
  for (const check of report.checks) lines.push(`${mark(check.status).padEnd(4)}  ${check.name} · ${check.message}`);
  return lines.join("\n");
}

export function formatPilotReadinessMarkdown(report) {
  const rows = report.checks.map((check) => `| ${check.status.toUpperCase()} | ${check.category} | ${check.name.replace(/\|/g, "\\|")} | ${check.message.replace(/\|/g, "\\|")} |`).join("\n");
  return `# DTA Company Pilot Readiness\n\n- Status: **${report.status.toUpperCase()}**\n- Profile: \`${report.profile}\`\n- DTA: \`${report.baseUrl}\`\n- Started: ${report.startedAt}\n- Finished: ${report.finishedAt}\n- Passed: ${report.summary.passed}\n- Failed: ${report.summary.failed}\n- Skipped: ${report.summary.skipped}\n\n| Status | Category | Check | Details |\n| --- | --- | --- | --- |\n${rows}\n`;
}
