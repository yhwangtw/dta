import type { AgentMetadata, GenericAgentEvent } from "@/lib/agents/agent-types";

export interface CreateAgentSessionInput {
  cwd: string;
  sessionId?: string;
  sessionFile?: string;
  metadata: AgentMetadata;
  toolNames?: string[];
  ephemeral?: boolean;
}

export interface AgentSessionHandle {
  sessionId: string;
  send(input: Record<string, unknown>): Promise<unknown>;
}

export interface AgentState {
  sessionId: string;
  running: boolean;
  state?: unknown;
}

export interface AgentRuntime {
  createSession(input: CreateAgentSessionInput): Promise<AgentSessionHandle>;
  send(sessionId: string, input: Record<string, unknown>): Promise<unknown>;
  getState(sessionId: string): Promise<AgentState>;
  subscribe(sessionId: string, listener: (event: GenericAgentEvent) => void): () => void;
}
