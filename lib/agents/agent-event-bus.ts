import type { GenericAgentEvent } from "./agent-types";

export interface AgentEventEnvelope {
  sequence: number;
  occurredAt: string;
  event: GenericAgentEvent;
}

const MAX_EVENTS_PER_RUN = 250;

export class AgentEventBus {
  private readonly histories = new Map<string, AgentEventEnvelope[]>();
  private readonly listeners = new Map<string, Set<(envelope: AgentEventEnvelope) => void>>();

  publish(runId: string, event: GenericAgentEvent): AgentEventEnvelope {
    const history = this.histories.get(runId) ?? [];
    const envelope: AgentEventEnvelope = {
      sequence: (history.at(-1)?.sequence ?? 0) + 1,
      occurredAt: new Date().toISOString(),
      event,
    };
    history.push(envelope);
    if (history.length > MAX_EVENTS_PER_RUN) history.splice(0, history.length - MAX_EVENTS_PER_RUN);
    this.histories.set(runId, history);
    for (const listener of this.listeners.get(runId) ?? []) listener(envelope);
    return envelope;
  }

  history(runId: string, afterSequence = 0): AgentEventEnvelope[] {
    return (this.histories.get(runId) ?? [])
      .filter((envelope) => envelope.sequence > afterSequence)
      .map((envelope) => structuredClone(envelope));
  }

  subscribe(runId: string, listener: (envelope: AgentEventEnvelope) => void): () => void {
    const listeners = this.listeners.get(runId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(runId);
    };
  }
}

declare global {
  var __dtaAgentEventBus: AgentEventBus | undefined;
}

export function getAgentEventBus(): AgentEventBus {
  globalThis.__dtaAgentEventBus ??= new AgentEventBus();
  return globalThis.__dtaAgentEventBus;
}
