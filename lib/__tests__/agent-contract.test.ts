import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRun, AgentRunInput } from "../agent-run-types";
import { AgentContractService } from "../agents/agent-contract-service";
import { AgentEventBus } from "../agents/agent-event-bus";
import { AgentRequestValidationError, parseAgentRequest, toAgentResponse } from "../agents/agent-contract";
import { AgentRegistry } from "../agents/agent-registry";
import { parseAgentManifest } from "../agents/agent-manifest";
import { writeMeetingRun } from "../agents/meeting/meeting-result-store";
import { createMeetingMediaJob, readMeetingMediaJob, updateMeetingMediaJob } from "../agents/meeting/meeting-media-job-store";

const originalEnabled = process.env.DTA_ENABLED_AGENTS;
const originalWorkspace = process.env.DTA_AGENT_WORKSPACE;
const originalDataDir = process.env.DTA_DATA_DIR;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.DTA_ENABLED_AGENTS;
  else process.env.DTA_ENABLED_AGENTS = originalEnabled;
  if (originalWorkspace === undefined) delete process.env.DTA_AGENT_WORKSPACE;
  else process.env.DTA_AGENT_WORKSPACE = originalWorkspace;
  if (originalDataDir === undefined) delete process.env.DTA_DATA_DIR;
  else process.env.DTA_DATA_DIR = originalDataDir;
});

describe("external Agent contract", () => {
  it("validates the framework-neutral request envelope", () => {
    expect(parseAgentRequest({ requestId: "req-1", task: "Generate minutes", input: { transcript: "hello" } }))
      .toEqual({ requestId: "req-1", task: "Generate minutes", input: { transcript: "hello" } });
    expect(() => parseAgentRequest({ requestId: "req-1", task: "", input: [] }))
      .toThrow(AgentRequestValidationError);
  });

  it("submits Meeting Agent work without accepting a caller filesystem path", async () => {
    process.env.DTA_ENABLED_AGENTS = "meeting-agent,pm-agent";
    process.env.DTA_AGENT_WORKSPACE = "/configured/dta-workspace";
    const enqueue = vi.fn((input: AgentRunInput): AgentRun => ({
      ...input,
      id: "run-123",
      trigger: "manual",
      status: "queued",
      createdAt: "2026-08-23T00:00:00.000Z",
    }));
    const service = new AgentContractService({ enqueue }, new AgentRegistry());

    const response = await service.submit("meeting", {
      requestId: "orchestrator-request-1",
      userId: "user-1",
      task: "Generate meeting minutes",
      input: { transcript: "The team approved the pilot.", cwd: "/caller/attempt" },
    });

    expect(response).toMatchObject({ requestId: "orchestrator-request-1", runId: "run-123", agentId: "meeting-agent", status: "running" });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "orchestrator-request-1",
      cwd: "/configured/dta-workspace",
      agentMetadata: expect.objectContaining({ agentType: "meeting", userId: "user-1" }),
    }));
    expect(enqueue.mock.calls[0][0].prompt).toContain("BEGIN CALLER INPUT");
  });

  it("attaches an owned completed media job to the accepted Meeting run", async () => {
    const root = mkdtempSync(join(tmpdir(), "dta-contract-media-"));
    process.env.DTA_DATA_DIR = root;
    process.env.DTA_ENABLED_AGENTS = "meeting-agent";
    const job = createMeetingMediaJob({
      userId: "user-1",
      sourceArtifactId: "source-artifact-1",
      name: "meeting.mp3",
      size: 100,
      kind: "audio",
      maxAttempts: 2,
    });
    updateMeetingMediaJob(job.id, (current) => ({
      ...current,
      status: "completed",
      progress: { stage: "completed", percent: 100, message: "done" },
      result: {
        name: current.name,
        size: current.size,
        ok: true,
        kind: current.kind,
        chars: 12,
        artifactId: current.sourceArtifactId,
        jobId: current.id,
        content: "pilot audio",
        processingStatus: "completed",
      },
      finishedAt: new Date().toISOString(),
    }));
    const enqueue = vi.fn((input: AgentRunInput): AgentRun => ({
      ...input,
      id: "accepted-run-123",
      trigger: "manual",
      status: "queued",
      createdAt: "2026-08-23T00:00:00.000Z",
    }));
    try {
      const service = new AgentContractService(
        { enqueue },
        new AgentRegistry(),
        { getConversationMemory: async () => null, appendConversationMemory: async () => undefined, deleteConversationMemory: async () => undefined },
      );
      await service.submit("meeting", {
        requestId: "request-with-media",
        userId: "user-1",
        task: "Analyze recording",
        input: { attachments: [{ jobId: job.id, artifactId: job.sourceArtifactId }] },
      });
      expect(readMeetingMediaJob(job.id)?.runId).toBe("accepted-run-123");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("routes a manifest-mounted department Agent without a central alias entry", async () => {
    process.env.DTA_ENABLED_AGENTS = "knowledge-agent";
    process.env.DTA_AGENT_WORKSPACE = "/configured/dta-workspace";
    const enqueue = vi.fn((input: AgentRunInput): AgentRun => ({
      ...input,
      id: "knowledge-run-123",
      trigger: "manual",
      status: "queued",
      createdAt: "2026-08-23T00:00:00.000Z",
    }));
    const definitions = parseAgentManifest({
      version: 1,
      agents: [{
        id: "knowledge-agent",
        displayName: "Knowledge Agent",
        description: "Creates governed knowledge briefs.",
        systemPrompt: "Preserve sources and approval gates.",
        skills: [],
      }],
    });
    const service = new AgentContractService(
      { enqueue },
      new AgentRegistry(definitions),
      { getConversationMemory: async () => null, appendConversationMemory: async () => undefined, deleteConversationMemory: async () => undefined },
    );

    const response = await service.submit("knowledge", {
      requestId: "knowledge-request-1",
      task: "Create a knowledge brief",
    });

    expect(response).toMatchObject({ runId: "knowledge-run-123", agentId: "knowledge-agent" });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      agentMetadata: expect.objectContaining({ agentType: "department", agentId: "knowledge-agent" }),
    }));
  });

  it("translates internal terminal states without exposing Pi objects", () => {
    const response = toAgentResponse({
      id: "run-failed",
      requestId: "req-failed",
      name: "Meeting",
      cwd: "/workspace",
      prompt: "task",
      toolNames: [],
      trigger: "manual",
      status: "interrupted",
      createdAt: "2026-08-23T00:00:00.000Z",
      error: "Worker restarted",
      agentMetadata: { agentType: "meeting", agentId: "meeting-agent", displayName: "Meeting Agent" },
    });
    expect(response).toEqual(expect.objectContaining({
      status: "failed",
      error: { code: "RUN_INTERRUPTED", message: "Worker restarted" },
    }));
    expect(JSON.stringify(response)).not.toContain("SessionManager");
  });

  it("withholds Meeting handoff actions until the revision is approved", () => {
    const root = mkdtempSync(join(tmpdir(), "dta-contract-review-"));
    process.env.DTA_DATA_DIR = root;
    const runId = "review-run-123";
    const base = {
      runId,
      status: "completed" as const,
      reviewStatus: "needs_review" as const,
      revision: 1,
      reviewHistory: [],
      result: { schemaVersion: "2.0" as const, summary: "Summary", decisions: [], actionItems: [], requirements: [] },
      artifacts: [],
      actions: [{ type: "handoff" as const, target: "pm-agent" }],
      updatedAt: "2026-08-23T00:00:00.000Z",
    };
    try {
      writeMeetingRun(base);
      const run: AgentRun = {
        id: runId,
        name: "Meeting",
        cwd: "/workspace",
        prompt: "task",
        toolNames: [],
        trigger: "manual",
        status: "completed",
        createdAt: base.updatedAt,
        agentMetadata: { agentType: "meeting", agentId: "meeting-agent", displayName: "Meeting Agent", runId },
        actions: base.actions,
      };
      expect(toAgentResponse(run)).toMatchObject({ review: { status: "needs_review", revision: 1 } });
      expect(toAgentResponse(run).actions).toBeUndefined();
      writeMeetingRun({ ...base, reviewStatus: "approved" });
      expect(toAgentResponse(run).actions).toEqual(base.actions);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("replays only normalized events after the requested sequence", () => {
    const bus = new AgentEventBus();
    bus.publish("run-1", { type: "run_started", runId: "run-1" });
    bus.publish("run-1", { type: "tool_started", tool: "publish_meeting_result" });
    expect(bus.history("run-1", 1)).toEqual([
      expect.objectContaining({ sequence: 2, event: { type: "tool_started", tool: "publish_meeting_result" } }),
    ]);
  });
});
