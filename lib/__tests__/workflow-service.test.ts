import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as executeWorkflowRoute } from "@/app/api/workflows/[workflow]/execute/route";
import { AgentRegistry } from "../agents/agent-registry";
import { writeMeetingRun } from "../agents/meeting/meeting-result-store";
import type { StoredMeetingResult } from "../agents/meeting/meeting-types";
import { loadDtaConfig } from "../config/env";
import { WorkflowService, WorkflowServiceError } from "../integrations/n8n/workflow-service";
import type { WorkflowExecutor } from "../integrations/n8n/workflow-executor";

const ORIGINAL_ENV = { ...process.env };
let root = "";

function meetingRun(reviewStatus: StoredMeetingResult["reviewStatus"]): StoredMeetingResult {
  return {
    runId: randomUUID(),
    userId: "local-user",
    projectId: "project-1",
    conversationId: "conversation-1",
    status: "completed",
    reviewStatus,
    revision: 1,
    reviewHistory: [],
    result: {
      title: "Weekly sync",
      summary: "Pilot approved.",
      decisions: [],
      actionItems: [{ title: "Create Jira task", owner: "Alex" }],
      requirements: [],
    },
    artifacts: [],
    actions: [],
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dta-workflows-"));
  process.env.DTA_DATA_DIR = root;
  process.env.DTA_WORKFLOW_PROVIDER = "mock";
  process.env.DTA_ENABLE_WORKFLOW_TOOLS = "true";
  process.env.DTA_ENABLED_AGENTS = "meeting-agent,pm-agent";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("n8n workflow control plane", () => {
  it("dispatches an approved result as a versioned envelope and deduplicates retries", async () => {
    const run = meetingRun("approved");
    writeMeetingRun(run);
    const execute = vi.fn(async () => ({ issueKeys: ["DTA-123"] }));
    const executor: WorkflowExecutor = { execute };
    const service = new WorkflowService(loadDtaConfig(), new AgentRegistry(), executor);

    const first = await service.execute({
      workflowId: "meeting-create-jira",
      agentId: "meeting-agent",
      sourceRunId: run.runId,
      actorId: "local-user",
      reason: "Approved follow-up",
      idempotencyKey: "meeting-jira-1",
    });
    const replay = await service.execute({
      workflowId: "meeting-create-jira",
      agentId: "meeting-agent",
      sourceRunId: run.runId,
      actorId: "local-user",
      reason: "Approved follow-up",
      idempotencyKey: "meeting-jira-1",
    });

    expect(first).toMatchObject({ replayed: false, execution: { status: "completed" } });
    expect(replay).toMatchObject({ replayed: true, execution: { id: first.execution.id } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("meeting-create-jira", expect.objectContaining({
      schemaVersion: "1.0",
      agent: { id: "meeting-agent", type: "meeting", displayName: "Meeting Agent" },
      source: expect.objectContaining({ runId: run.runId, reviewStatus: "approved", revision: 1 }),
      result: run.result,
    }), expect.objectContaining({ executionId: first.execution.id, idempotencyKey: "meeting-jira-1" }));
  });

  it("blocks downstream workflows until the Meeting result is approved", async () => {
    const run = meetingRun("needs_review");
    writeMeetingRun(run);
    const service = new WorkflowService(loadDtaConfig(), new AgentRegistry(), { execute: vi.fn() });

    expect(service.catalog("meeting-agent", run.runId).workflows[0]).toMatchObject({
      available: false,
      requiresApproval: true,
    });
    await expect(service.execute({
      workflowId: "meeting-create-jira",
      agentId: "meeting-agent",
      sourceRunId: run.runId,
      actorId: "local-user",
      reason: "Too early",
    })).rejects.toMatchObject({ code: "WORKFLOW_BLOCKED", status: 409 } satisfies Partial<WorkflowServiceError>);
  });

  it("exposes an authenticated route that never accepts a caller-supplied workflow payload", async () => {
    const run = meetingRun("approved");
    writeMeetingRun(run);
    const response = await executeWorkflowRoute(new Request("http://localhost/api/workflows/meeting-notify-teams/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "notify-1" },
      body: JSON.stringify({
        agentId: "meeting-agent",
        sourceRunId: run.runId,
        reason: "Notify after approval",
        payload: { injected: true },
      }),
    }), { params: Promise.resolve({ workflow: "meeting-notify-teams" }) });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ execution: { workflowId: "meeting-notify-teams", status: "completed" } });
  });
});
