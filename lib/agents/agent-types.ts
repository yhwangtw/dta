export type AgentType = "coding" | "meeting" | "pm";

export interface AgentMetadata {
  agentType: AgentType;
  agentId: string;
  displayName: string;
  runId?: string;
  userId?: string;
  projectId?: string;
  conversationId?: string;
}

export interface AgentAction {
  type: "handoff" | "workflow" | "notification";
  target?: string;
  payload?: unknown;
  reason?: string;
}

export type GenericAgentEvent =
  | { type: "run_started"; runId: string }
  | { type: "status"; message: string }
  | { type: "tool_started"; tool: string }
  | { type: "tool_completed"; tool: string; result?: unknown }
  | { type: "artifact_created"; artifactId: string; artifactType: string }
  | { type: "waiting_for_input"; prompt: string }
  | { type: "completed"; result: unknown }
  | { type: "failed"; error: string };

const AGENT_TYPES = new Set<AgentType>(["coding", "meeting", "pm"]);

export function isAgentMetadata(value: unknown): value is AgentMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<AgentMetadata>;
  return AGENT_TYPES.has(item.agentType as AgentType)
    && typeof item.agentId === "string"
    && item.agentId.trim().length > 0
    && item.agentId.length <= 100
    && typeof item.displayName === "string"
    && item.displayName.trim().length > 0
    && item.displayName.length <= 160
    && [item.runId, item.userId, item.projectId, item.conversationId]
      .every((entry) => entry === undefined || (typeof entry === "string" && entry.length <= 500));
}

export function codingAgentMetadata(): AgentMetadata {
  return {
    agentType: "coding",
    agentId: "coding-agent",
    displayName: "Coding Agent",
  };
}
