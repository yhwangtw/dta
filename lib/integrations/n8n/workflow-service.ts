import type { AgentDefinition, AgentRegistry } from "@/lib/agents/agent-registry";
import { getAgentRegistry } from "@/lib/agents/agent-registry";
import { readMeetingRun } from "@/lib/agents/meeting/meeting-result-store";
import { readPMRun } from "@/lib/agents/pm/pm-result-store";
import { readAgentRunStore } from "@/lib/agent-run-store";
import type { DtaConfig } from "@/lib/config/env";
import { loadDtaConfig } from "@/lib/config/env";
import { recordAuditEvent } from "@/lib/observability/audit-log";
import { createWorkflowExecutor } from "./index";
import { listAgentWorkflowCatalog, requireAgentWorkflow } from "./workflow-catalog";
import {
  beginWorkflowExecution,
  completeWorkflowExecution,
  failWorkflowExecution,
  findWorkflowExecution,
  listWorkflowExecutions,
  restartWorkflowExecution,
  type WorkflowExecutionRecord,
} from "./workflow-execution-store";
import type { WorkflowExecutor } from "./workflow-executor";

export class WorkflowServiceError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "WORKFLOW_ERROR") {
    super(message);
  }
}

interface WorkflowSource {
  runId: string;
  userId?: string;
  projectId?: string;
  conversationId?: string;
  status: string;
  updatedAt: string;
  revision?: number;
  reviewStatus?: string;
  result?: unknown;
  artifacts: unknown[];
  actions: unknown[];
}

function sourceFor(agent: AgentDefinition, sourceRunId: string): WorkflowSource {
  if (agent.agentType === "meeting") {
    const run = readMeetingRun(sourceRunId);
    if (!run) throw new WorkflowServiceError("Meeting run not found", 404, "SOURCE_RUN_NOT_FOUND");
    return run;
  }
  if (agent.agentType === "pm") {
    const run = readPMRun(sourceRunId);
    if (!run) throw new WorkflowServiceError("PM run not found", 404, "SOURCE_RUN_NOT_FOUND");
    return run;
  }
  const run = readAgentRunStore().runs.find((candidate) => candidate.id === sourceRunId);
  if (!run || run.agentMetadata?.agentId !== agent.id) {
    throw new WorkflowServiceError("Agent run not found", 404, "SOURCE_RUN_NOT_FOUND");
  }
  return {
    runId: run.id,
    ...(run.agentMetadata?.userId ? { userId: run.agentMetadata.userId } : {}),
    ...(run.agentMetadata?.projectId ? { projectId: run.agentMetadata.projectId } : {}),
    ...(run.agentMetadata?.conversationId ? { conversationId: run.agentMetadata.conversationId } : {}),
    status: run.status,
    updatedAt: run.finishedAt ?? run.startedAt ?? run.createdAt,
    ...(run.result !== undefined ? { result: run.result } : {}),
    artifacts: run.artifacts ?? [],
    actions: run.actions ?? [],
  };
}

function blockReason(agent: AgentDefinition, source: WorkflowSource, enabled: boolean): string | null {
  if (!enabled) return "Workflow execution is disabled or the workflow is not configured.";
  if (source.status !== "completed" || source.result === undefined) return "The Agent result is not ready.";
  if (agent.agentType === "meeting" && source.reviewStatus !== "approved") {
    return "Approve this meeting revision before executing downstream workflows.";
  }
  return null;
}

function defaultIdempotencyKey(source: WorkflowSource, workflowId: string): string {
  return [source.runId, workflowId, source.revision ?? source.updatedAt].join(":").slice(0, 500);
}

export class WorkflowService {
  constructor(
    private readonly config: DtaConfig = loadDtaConfig(),
    private readonly registry: AgentRegistry = getAgentRegistry(),
    private readonly executor: WorkflowExecutor = createWorkflowExecutor(),
  ) {}

  catalog(agentId: string, sourceRunId?: string) {
    const agent = this.registry.require(agentId);
    const source = sourceRunId ? sourceFor(agent, sourceRunId) : null;
    const workflows = listAgentWorkflowCatalog(agentId, this.config, this.registry).map((workflow) => {
      const blockedReason = source ? blockReason(agent, source, workflow.enabled) : workflow.enabled ? null : "Workflow execution is disabled or not configured.";
      return {
        ...workflow,
        available: Boolean(source && !blockedReason),
        ...(blockedReason ? { blockedReason } : {}),
        ...(source ? { idempotencyKey: defaultIdempotencyKey(source, workflow.id) } : {}),
      };
    });
    return {
      provider: this.config.workflowProvider,
      enabled: this.config.enableWorkflowTools,
      ...(this.config.n8nEditorUrl ? { editorUrl: this.config.n8nEditorUrl } : {}),
      workflows,
      executions: sourceRunId ? listWorkflowExecutions({ agentId, sourceRunId }) : [],
      source,
    };
  }

  async execute(input: {
    workflowId: string;
    agentId: string;
    sourceRunId: string;
    actorId: string;
    reason: string;
    idempotencyKey?: string;
  }): Promise<{ execution: WorkflowExecutionRecord; replayed: boolean }> {
    const agent = this.registry.require(input.agentId);
    const workflow = requireAgentWorkflow(input.agentId, input.workflowId, this.config, this.registry);
    const source = sourceFor(agent, input.sourceRunId);
    const blocked = blockReason(agent, source, workflow.enabled);
    if (blocked) throw new WorkflowServiceError(blocked, 409, "WORKFLOW_BLOCKED");
    const reason = input.reason.trim().slice(0, 2_000);
    if (!reason) throw new WorkflowServiceError("Workflow execution reason is required", 400, "REASON_REQUIRED");
    const idempotencyKey = (input.idempotencyKey?.trim() || defaultIdempotencyKey(source, workflow.id)).slice(0, 500);
    const existing = findWorkflowExecution({
      workflowId: workflow.id,
      agentId: agent.id,
      sourceRunId: source.runId,
      idempotencyKey,
    });
    if (existing?.status === "completed") return { execution: existing, replayed: true };
    if (existing?.status === "running") {
      throw new WorkflowServiceError("This workflow execution is already running", 409, "WORKFLOW_ALREADY_RUNNING");
    }
    const execution = existing
      ? restartWorkflowExecution(existing.id)
      : beginWorkflowExecution({
        idempotencyKey,
        workflowId: workflow.id,
        agentId: agent.id,
        sourceRunId: source.runId,
        actorId: input.actorId,
        reason,
      });
    const envelope = {
      schemaVersion: "1.0",
      execution: {
        id: execution.id,
        idempotencyKey,
        requestedAt: execution.requestedAt,
        requestedBy: input.actorId,
        reason,
      },
      workflow: { id: workflow.id },
      agent: { id: agent.id, type: agent.agentType, displayName: agent.displayName },
      source: {
        runId: source.runId,
        ...(source.userId ? { userId: source.userId } : {}),
        ...(source.projectId ? { projectId: source.projectId } : {}),
        ...(source.conversationId ? { conversationId: source.conversationId } : {}),
        updatedAt: source.updatedAt,
        ...(source.revision !== undefined ? { revision: source.revision } : {}),
        ...(source.reviewStatus ? { reviewStatus: source.reviewStatus } : {}),
      },
      result: source.result,
      artifacts: source.artifacts,
      actions: source.actions,
    };
    try {
      const result = await this.executor.execute(workflow.id, envelope, {
        executionId: execution.id,
        idempotencyKey,
        runId: source.runId,
        ...(source.userId ? { userId: source.userId } : {}),
        actorId: input.actorId,
        ...(source.projectId ? { projectId: source.projectId } : {}),
        ...(source.conversationId ? { conversationId: source.conversationId } : {}),
      });
      const completed = completeWorkflowExecution(execution.id, result);
      recordAuditEvent({
        action: "workflow.dispatch",
        actorId: input.actorId,
        resourceType: "n8n_workflow",
        resourceId: workflow.id,
        outcome: "success",
        metadata: { executionId: execution.id, sourceRunId: source.runId, agentId: agent.id, ...(source.userId ? { actingUserId: source.userId } : {}) },
      });
      return { execution: completed, replayed: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failWorkflowExecution(execution.id, message);
      recordAuditEvent({
        action: "workflow.dispatch",
        actorId: input.actorId,
        resourceType: "n8n_workflow",
        resourceId: workflow.id,
        outcome: "failure",
        metadata: { executionId: execution.id, sourceRunId: source.runId, agentId: agent.id, ...(source.userId ? { actingUserId: source.userId } : {}) },
      });
      throw new WorkflowServiceError(message, 502, "WORKFLOW_EXECUTION_FAILED");
    }
  }
}
