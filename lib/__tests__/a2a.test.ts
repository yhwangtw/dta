import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildA2AAgentCard } from "../a2a/agent-card";
import { A2AValidationError, parseA2ASendMessage, runToA2ATask } from "../a2a/a2a-adapter";
import { A2AListTasksValidationError, listA2ATasks } from "../a2a/a2a-list-tasks";
import type { AgentRun } from "../agent-run-types";
import { resetAgentRegistryForTests } from "../agents/agent-registry";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
  resetAgentRegistryForTests();
});

const principal = { id: "user-1", roles: ["dta-user"], authType: "keycloak" as const };

describe("A2A v1 adapter", () => {
  it("publishes a framework-neutral Agent Card with Meeting and PM skills", () => {
    process.env.DTA_ENABLED_AGENTS = "meeting-agent,pm-agent";
    process.env.DTA_PUBLIC_BASE_URL = "https://dta.example.com";
    process.env.DTA_AUTH_MODE = "keycloak";
    process.env.KEYCLOAK_ISSUER = "https://login.example.com/realms/company";
    const card = buildA2AAgentCard() as Record<string, unknown>;
    expect(card).toMatchObject({
      name: "Digital Transformation Agent",
      supportedInterfaces: [{ url: "https://dta.example.com/a2a/v1", protocolBinding: "HTTP+JSON", protocolVersion: "1.0" }],
      capabilities: { streaming: true, pushNotifications: false },
    });
    expect((card.skills as Array<{ id: string }>).map((skill) => skill.id)).toEqual(["meeting-minutes", "pm-analysis"]);
    expect(JSON.stringify(card)).not.toContain("PiAgentRuntime");
  });

  it("routes a message by public agent metadata and preserves its context id", () => {
    const parsed = parseA2ASendMessage({
      message: {
        messageId: "message-1",
        role: "ROLE_USER",
        contextId: "conversation-1",
        metadata: { agentId: "meeting-agent" },
        parts: [{ text: "Generate minutes from this transcript" }, { data: { transcript: "Pilot approved" } }],
      },
    }, principal);
    expect(parsed).toMatchObject({
      agentAlias: "meeting-agent",
      request: { requestId: "message-1", userId: "user-1", conversationId: "conversation-1", input: { transcript: "Pilot approved" } },
    });
  });

  it("does not fetch untrusted remote file URLs", () => {
    expect(() => parseA2ASendMessage({
      message: { messageId: "message-file", role: "ROLE_USER", parts: [{ url: "http://169.254.169.254/latest/meta-data" }] },
    }, principal)).toThrow(A2AValidationError);
  });

  it("applies a mounted Department Agent role policy to A2A submissions", () => {
    const root = mkdtempSync(join(tmpdir(), "dta-a2a-manifest-"));
    const path = join(root, "agents.json");
    writeFileSync(path, JSON.stringify({
      version: 2,
      agents: [{
        id: "knowledge-agent",
        displayName: "Knowledge Agent",
        description: "Creates governed briefs.",
        systemPrompt: "Preserve source evidence.",
        outputSchema: { type: "object", required: ["brief"], properties: { brief: { type: "string" } } },
        allowedRoles: ["dta-knowledge"],
        skills: [{ id: "knowledge-brief", name: "Knowledge brief", description: "Create a brief", tags: ["knowledge"], inputModes: ["application/json"], outputModes: ["application/json"] }],
      }],
    }));
    process.env.DTA_AGENT_MANIFEST_PATH = path;
    process.env.DTA_ENABLED_AGENTS = "knowledge-agent";
    resetAgentRegistryForTests();
    const message = {
      message: { messageId: "knowledge-1", role: "ROLE_USER", metadata: { agentId: "knowledge-agent" }, parts: [{ text: "Create a brief" }] },
    };
    try {
      expect(() => parseA2ASendMessage(message, principal)).toThrow(/lacks access/);
      expect(parseA2ASendMessage(message, { ...principal, roles: ["dta-user", "dta-knowledge"] }).agentAlias).toBe("knowledge-agent");
      expect((buildA2AAgentCard().skills as Array<{ id: string }>).map((skill) => skill.id)).not.toContain("knowledge-brief");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("maps internal run state and artifacts to the A2A task model", () => {
    process.env.DTA_PUBLIC_BASE_URL = "https://dta.example.com";
    const task = runToA2ATask({
      id: "run-1",
      requestId: "message-1",
      name: "Meeting",
      cwd: "/workspace",
      prompt: "Generate",
      toolNames: [],
      trigger: "manual",
      status: "completed",
      createdAt: "2026-08-23T00:00:00.000Z",
      finishedAt: "2026-08-23T00:01:00.000Z",
      agentMetadata: { agentType: "meeting", agentId: "meeting-agent", displayName: "Meeting Agent", conversationId: "conversation-1" },
      artifacts: [{ id: "artifact-1", type: "meeting_minutes", title: "Minutes", mimeType: "text/markdown", size: 100, createdAt: "2026-08-23T00:01:00.000Z" }],
    });
    expect(task).toMatchObject({ id: "run-1", contextId: "conversation-1", status: { state: "TASK_STATE_COMPLETED" } });
    expect(task.artifacts?.[0].parts[0].url).toBe("https://dta.example.com/api/artifacts/artifact-1");
  });

  it("lists only visible domain tasks using cursor pagination and optional artifacts", () => {
    process.env.DTA_PUBLIC_BASE_URL = "https://dta.example.com";
    const run = (id: string, userId: string, createdAt: string, agentType: "meeting" | "pm" | "coding" = "meeting"): AgentRun => ({
      id,
      requestId: `request-${id}`,
      name: id,
      cwd: "/workspace",
      prompt: "Generate",
      toolNames: [],
      trigger: "manual",
      status: "completed",
      createdAt,
      finishedAt: createdAt,
      agentMetadata: {
        agentType,
        agentId: agentType === "coding" ? "coding-agent" : `${agentType}-agent`,
        displayName: `${agentType} Agent`,
        userId,
        conversationId: "conversation-1",
      },
      artifacts: [{ id: `artifact-${id}`, type: "meeting_minutes", title: id, mimeType: "text/markdown", size: 10, createdAt }],
    });
    const runs = [
      run("run-3", "user-1", "2026-08-23T03:00:00.000Z"),
      run("run-2", "user-1", "2026-08-23T02:00:00.000Z", "pm"),
      run("run-1", "user-1", "2026-08-23T01:00:00.000Z"),
      run("private-run", "user-2", "2026-08-23T04:00:00.000Z"),
      run("coding-run", "user-1", "2026-08-23T05:00:00.000Z", "coding"),
    ];

    const first = listA2ATasks(new URLSearchParams({ pageSize: "2" }), principal, runs);
    expect(first.tasks.map((task) => task.id)).toEqual(["run-3", "run-2"]);
    expect(first.tasks.every((task) => !("artifacts" in task))).toBe(true);
    expect(first).toMatchObject({ pageSize: 2, totalSize: 3 });
    expect(first.nextPageToken).not.toBe("");

    const second = listA2ATasks(new URLSearchParams({
      pageSize: "2",
      pageToken: first.nextPageToken,
      includeArtifacts: "true",
    }), principal, runs);
    expect(second.tasks.map((task) => task.id)).toEqual(["run-1"]);
    expect(second.tasks[0].artifacts).toHaveLength(1);
    expect(second.nextPageToken).toBe("");
  });

  it("validates ListTasks query parameters", () => {
    expect(() => listA2ATasks(new URLSearchParams({ pageSize: "101" }), principal, [])).toThrow(A2AListTasksValidationError);
    expect(() => listA2ATasks(new URLSearchParams({ includeArtifacts: "yes" }), principal, [])).toThrow(A2AListTasksValidationError);
    expect(() => listA2ATasks(new URLSearchParams({ pageToken: "not-a-cursor" }), principal, [])).toThrow(A2AListTasksValidationError);
  });
});
