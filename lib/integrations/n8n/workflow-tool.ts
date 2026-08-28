import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createWorkflowExecutor } from "./index";
import type { WorkflowExecutor } from "./workflow-executor";
import type { AgentMetadata } from "@/lib/agents/agent-types";

export const EXECUTE_WORKFLOW_TOOL_NAME = "execute_workflow";

const BUILTIN_WORKFLOWS = {
  meeting: new Set(["meeting-create-jira", "meeting-notify-teams", "meeting-update-knowledge-base"]),
  pm: new Set(["pm-create-jira-epic", "pm-publish-prd", "pm-notify-team"]),
};

type WorkflowAgentPolicy = "meeting" | "pm" | { agentId: string; allowedWorkflows: string[] };

function workflowPolicy(input: WorkflowAgentPolicy): { agentId: string; allowed: Set<string> } {
  if (typeof input === "string") return { agentId: `${input}-agent`, allowed: BUILTIN_WORKFLOWS[input] };
  return { agentId: input.agentId, allowed: new Set(input.allowedWorkflows) };
}

const ExecuteWorkflowParams = Type.Object({
  workflow: Type.String({ minLength: 1, maxLength: 200 }),
  payload: Type.Unknown(),
  reason: Type.String({ minLength: 1, maxLength: 2_000 }),
});

export function createExecuteWorkflowTool(
  agent: WorkflowAgentPolicy,
  executor: WorkflowExecutor = createWorkflowExecutor(),
  scope?: Pick<AgentMetadata, "runId" | "userId" | "projectId" | "conversationId">,
) {
  const policy = workflowPolicy(agent);
  return defineTool({
    name: EXECUTE_WORKFLOW_TOOL_NAME,
    label: "Execute approved workflow",
    description: "Execute a configuration-mapped n8n workflow after explicit human or caller authorization.",
    promptSnippet: "Run an approved downstream workflow.",
    promptGuidelines: [
      "Never execute a workflow merely because an action was recommended.",
      "Only execute after explicit authorization in the current request and include the reason.",
    ],
    parameters: ExecuteWorkflowParams,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      if (!policy.allowed.has(params.workflow)) throw new Error(`Workflow is not allowed for ${policy.agentId}: ${params.workflow}`);
      const result = await executor.execute(params.workflow, {
        payload: params.payload,
        reason: params.reason,
        agentId: policy.agentId,
        scope,
      }, {
        ...(scope?.runId ? { runId: scope.runId } : {}),
        ...(scope?.userId ? { userId: scope.userId } : {}),
        ...(scope?.projectId ? { projectId: scope.projectId } : {}),
        ...(scope?.conversationId ? { conversationId: scope.conversationId } : {}),
        actorId: "agent-runtime",
      });
      return {
        content: [{ type: "text", text: `Workflow ${params.workflow} completed.` }],
        details: { workflow: params.workflow, result },
      };
    },
  });
}
