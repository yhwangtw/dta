import { ensureMeetingRun } from "@/lib/agents/meeting/meeting-result-store";
import { ensurePMRun } from "@/lib/agents/pm/pm-result-store";
import type { AgentMetadata, GenericAgentEvent } from "@/lib/agents/agent-types";
import type { AgentRuntime, AgentState } from "@/lib/runtime/agent-runtime";
import { PiAgentRuntime } from "@/lib/runtime/pi-agent-runtime";
import { getAgentRegistry, type AgentRegistry } from "./agent-registry";

export interface CreateAgentExecutionInput {
  cwd: string;
  metadata?: AgentMetadata;
  agentId?: string;
  runId?: string;
  userId?: string;
  projectId?: string;
  conversationId?: string;
  sessionId?: string;
  sessionFile?: string;
  toolNames?: string[];
  ephemeral?: boolean;
}

export interface StartAgentExecutionInput extends CreateAgentExecutionInput {
  command: Record<string, unknown>;
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
}

export interface AgentExecutionHandle {
  sessionId: string;
  metadata: AgentMetadata;
  send(input: Record<string, unknown>): Promise<unknown>;
  getState(): Promise<AgentState>;
  subscribe(listener: (event: GenericAgentEvent) => void): () => void;
  abort(): Promise<void>;
}

export class AgentExecutionService {
  constructor(
    private readonly runtime: AgentRuntime = new PiAgentRuntime(),
    private readonly registry: AgentRegistry = getAgentRegistry(),
  ) {}

  private metadata(input: CreateAgentExecutionInput): AgentMetadata {
    if (input.metadata) {
      return this.registry.normalizeMetadata(input.metadata, { allowInternal: true });
    }
    return this.registry.createMetadata({
      agentId: input.agentId ?? "coding-agent",
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    }, { allowInternal: true });
  }

  async createSession(input: CreateAgentExecutionInput): Promise<AgentExecutionHandle> {
    const metadata = this.metadata(input);
    const session = await this.runtime.createSession({
      cwd: input.cwd,
      metadata,
      sessionId: input.sessionId,
      sessionFile: input.sessionFile,
      toolNames: input.toolNames,
      ephemeral: input.ephemeral,
    });
    if (metadata.agentType === "meeting" && metadata.runId) {
      ensureMeetingRun(metadata.runId, session.sessionId, metadata);
    }
    if (metadata.agentType === "pm" && metadata.runId) {
      ensurePMRun(metadata.runId, session.sessionId, metadata);
    }
    globalThis.__piAllowedRootsCache?.roots.add(input.cwd);
    return {
      sessionId: session.sessionId,
      metadata,
      send: (command) => session.send(command),
      getState: () => this.runtime.getState(session.sessionId),
      subscribe: (listener) => this.runtime.subscribe(session.sessionId, listener),
      abort: async () => {
        await this.runtime.send(session.sessionId, { type: "abort" });
      },
    };
  }

  async startSession(input: StartAgentExecutionInput): Promise<{ session: AgentExecutionHandle; result: unknown }> {
    if (!!input.provider !== !!input.modelId) throw new Error("provider and modelId must be set together");
    const session = await this.createSession(input);
    if (input.provider && input.modelId) {
      await session.send({ type: "set_model", provider: input.provider, modelId: input.modelId });
    }
    if (input.thinkingLevel) {
      await session.send({ type: "set_thinking_level", level: input.thinkingLevel });
    }
    const result = await session.send(input.command);
    return { session, result };
  }
}

let defaultExecutionService: AgentExecutionService | null = null;

export function getAgentExecutionService(): AgentExecutionService {
  defaultExecutionService ??= new AgentExecutionService();
  return defaultExecutionService;
}
