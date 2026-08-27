import type { DtaConfig } from "@/lib/config/env";
import { loadDtaConfig } from "@/lib/config/env";
import { getAgentRegistry, type AgentRegistry } from "@/lib/agents/agent-registry";

export interface WorkflowCatalogEntry {
  id: string;
  displayName: string;
  description: string;
  agentId: string;
  provider: DtaConfig["workflowProvider"];
  configured: boolean;
  enabled: boolean;
  requiresApproval: boolean;
}

const BUILTIN_WORKFLOW_COPY: Record<string, Pick<WorkflowCatalogEntry, "displayName" | "description">> = {
  "meeting-create-jira": {
    displayName: "Create Jira follow-up tasks",
    description: "Send approved meeting action items to an n8n workflow that creates Jira work.",
  },
  "meeting-notify-teams": {
    displayName: "Notify the meeting team",
    description: "Send approved meeting outcomes to an n8n workflow that posts the team notification.",
  },
  "meeting-update-knowledge-base": {
    displayName: "Publish meeting knowledge",
    description: "Send approved minutes and artifacts to an n8n knowledge publication workflow.",
  },
  "pm-create-jira-epic": {
    displayName: "Create Jira epic",
    description: "Send PM artifacts to an n8n workflow that creates an epic and delivery structure.",
  },
  "pm-publish-prd": {
    displayName: "Publish PRD",
    description: "Send the generated PRD and references to an n8n publication workflow.",
  },
  "pm-notify-team": {
    displayName: "Notify the delivery team",
    description: "Send the PM delivery package to an n8n team-notification workflow.",
  },
};

function humanizeWorkflowId(id: string): string {
  return id
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function listAgentWorkflowCatalog(
  agentId: string,
  config: DtaConfig = loadDtaConfig(),
  registry: AgentRegistry = getAgentRegistry(),
): WorkflowCatalogEntry[] {
  const agent = registry.require(agentId);
  const workflowIds = [...new Set(agent.workflowAllowlist ?? [])];
  return workflowIds.map((id) => {
    const copy = BUILTIN_WORKFLOW_COPY[id] ?? {
      displayName: humanizeWorkflowId(id),
      description: `Execute the approved ${id} workflow through the configured workflow provider.`,
    };
    const configured = config.workflowProvider === "mock"
      ? process.env.NODE_ENV !== "production"
      : config.workflowProvider === "n8n" && Boolean(config.n8nWorkflows[id]);
    return {
      id,
      ...copy,
      agentId,
      provider: config.workflowProvider,
      configured,
      enabled: config.enableWorkflowTools && configured,
      requiresApproval: agent.agentType === "meeting",
    };
  });
}

export function requireAgentWorkflow(
  agentId: string,
  workflowId: string,
  config: DtaConfig = loadDtaConfig(),
  registry: AgentRegistry = getAgentRegistry(),
): WorkflowCatalogEntry {
  const workflow = listAgentWorkflowCatalog(agentId, config, registry)
    .find((entry) => entry.id === workflowId);
  if (!workflow) throw new Error(`Workflow is not allowed for ${agentId}: ${workflowId}`);
  return workflow;
}
