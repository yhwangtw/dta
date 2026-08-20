import { readAgentSessionMetadata, writeAgentSessionMetadata } from "@/lib/agent-metadata-store";
import { codingAgentMetadata, type GenericAgentEvent } from "@/lib/agents/agent-types";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";
import { createRuntimeProfile } from "./runtime-profile";
import { normalizePiAgentEvent } from "./normalize-agent-event";
import type { AgentRuntime, AgentSessionHandle, AgentState, CreateAgentSessionInput } from "./agent-runtime";

export class PiAgentRuntime implements AgentRuntime {
  async createSession(input: CreateAgentSessionInput): Promise<AgentSessionHandle> {
    const profile = createRuntimeProfile(input.metadata);
    const started = await startRpcSession(
      input.sessionId ?? `__agent__${input.metadata.runId ?? Date.now()}`,
      input.sessionFile ?? "",
      input.cwd,
      input.toolNames,
      { ephemeral: input.ephemeral, profile },
    );
    writeAgentSessionMetadata(started.realSessionId, input.metadata);
    return {
      sessionId: started.realSessionId,
      send: (command) => started.session.send(command),
    };
  }

  async send(sessionId: string, input: Record<string, unknown>): Promise<unknown> {
    const session = getRpcSession(sessionId);
    if (!session?.isAlive()) throw new Error("Agent session is not active");
    return session.send(input);
  }

  async getState(sessionId: string): Promise<AgentState> {
    const session = getRpcSession(sessionId);
    if (!session?.isAlive()) return { sessionId, running: false };
    return { sessionId, running: true, state: await session.send({ type: "get_state" }) };
  }

  subscribe(sessionId: string, listener: (event: GenericAgentEvent) => void): () => void {
    const session = getRpcSession(sessionId);
    if (!session?.isAlive()) throw new Error("Agent session is not active");
    const metadata = readAgentSessionMetadata(sessionId) ?? codingAgentMetadata();
    const runId = metadata.runId ?? sessionId;
    return session.onEvent((event) => {
      const normalized = normalizePiAgentEvent(event, runId);
      if (normalized) listener(normalized);
    });
  }
}
