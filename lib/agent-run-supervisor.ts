import { randomUUID } from "node:crypto";
import {
  mutateAgentRunStore,
  readAgentRunStore,
  reconcileInterruptedAgentRuns,
} from "./agent-run-store";
import {
  DEFAULT_AGENT_RUN_CONCURRENCY,
  isAgentRunConcurrency,
  MAX_AGENT_RUN_CONCURRENCY,
  MIN_AGENT_RUN_CONCURRENCY,
  TERMINAL_AGENT_RUN_STATUSES,
  type AgentRun,
  type AgentRunInput,
  type AgentRunStatus,
} from "./agent-run-types";
import { isTrustedAgentRunWorkspace } from "./agent-run-workspace";
import { buildAgentRunReport } from "./agent-run-report";
import type { AgentMessage } from "./types";
import { failMeetingRun, readMeetingRun } from "./agents/meeting/meeting-result-store";
import { failPMRun, readPMRun } from "./agents/pm/pm-result-store";
import {
  AgentExecutionService,
  getAgentExecutionService,
  type AgentExecutionHandle,
} from "./agents/agent-execution-service";
import { getAgentEventBus } from "./agents/agent-event-bus";
import { getMemoryStore } from "./integrations/memory";
import { conversationMemoryKey } from "./integrations/memory/memory-key";

const KEEP_ALIVE_MS = 4 * 60_000;
const MAX_RUN_MS = 24 * 60 * 60_000;

interface ActiveRun {
  session: AgentExecutionHandle | null;
  unsubscribe: (() => void) | null;
  keepAlive: ReturnType<typeof setInterval> | null;
  timeout: ReturnType<typeof setTimeout> | null;
  waitingForInput: boolean;
}

export class AgentRunNotFoundError extends Error {}
export class AgentRunConflictError extends Error {}

function configuredConcurrency(): number {
  const parsed = Number.parseInt(process.env.PIWEB_AGENT_CONCURRENCY ?? "", 10);
  return Number.isFinite(parsed)
    ? Math.max(MIN_AGENT_RUN_CONCURRENCY, Math.min(MAX_AGENT_RUN_CONCURRENCY, parsed))
    : DEFAULT_AGENT_RUN_CONCURRENCY;
}

function cloneRun(run: AgentRun): AgentRun {
  return structuredClone(run);
}

export class AgentRunSupervisor {
  private maxConcurrencyValue: number;
  private readonly executionService: AgentExecutionService;
  private readonly active = new Map<string, ActiveRun>();
  private started = false;
  private draining = false;

  constructor(options: { maxConcurrency?: number; executionService?: AgentExecutionService } = {}) {
    const persisted = options.maxConcurrency === undefined
      ? readAgentRunStore().maxConcurrency
      : undefined;
    this.maxConcurrencyValue = options.maxConcurrency ?? persisted ?? configuredConcurrency();
    this.executionService = options.executionService ?? getAgentExecutionService();
  }

  get maxConcurrency(): number {
    return this.maxConcurrencyValue;
  }

  setMaxConcurrency(value: number): number {
    if (!isAgentRunConcurrency(value)) {
      throw new RangeError(
        `maxConcurrency must be an integer between ${MIN_AGENT_RUN_CONCURRENCY} and ${MAX_AGENT_RUN_CONCURRENCY}`,
      );
    }
    mutateAgentRunStore((store) => {
      store.maxConcurrency = value;
    });
    this.maxConcurrencyValue = value;
    this.drain();
    return value;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    reconcileInterruptedAgentRuns();
    this.drain();
  }

  enqueue(input: AgentRunInput, options: {
    trigger?: AgentRun["trigger"];
    parentRunId?: string;
  } = {}): AgentRun {
    if (input.requestId) {
      const existing = readAgentRunStore().runs.find((run) => run.requestId === input.requestId
        && run.agentMetadata?.agentId === input.agentMetadata?.agentId
        && run.agentMetadata?.userId === input.agentMetadata?.userId);
      if (existing) return cloneRun(existing);
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    const agentMetadata = input.agentMetadata
      ? { ...input.agentMetadata, runId: input.agentMetadata.runId ?? id }
      : undefined;
    const run: AgentRun = {
      ...input,
      ...(agentMetadata ? { agentMetadata } : {}),
      id,
      trigger: options.trigger ?? "manual",
      status: "queued",
      createdAt: now,
      ...(options.parentRunId ? { parentRunId: options.parentRunId } : {}),
    };
    mutateAgentRunStore((store) => {
      store.runs.unshift(run);
    });
    getAgentEventBus().publish(run.id, { type: "status", message: "Run queued", state: "running" });
    this.drain();
    return cloneRun(run);
  }

  retry(runId: string): AgentRun {
    const original = readAgentRunStore().runs.find((run) => run.id === runId);
    if (!original) throw new AgentRunNotFoundError("Agent run not found");
    if (!TERMINAL_AGENT_RUN_STATUSES.has(original.status)) {
      throw new AgentRunConflictError("Only terminal runs can be retried");
    }
    return this.enqueue({
      name: original.name,
      cwd: original.cwd,
      prompt: original.prompt,
      provider: original.provider,
      modelId: original.modelId,
      thinkingLevel: original.thinkingLevel,
      toolNames: [...original.toolNames],
      workspace: original.workspace ? { ...original.workspace } : undefined,
      agentMetadata: original.agentMetadata ? { ...original.agentMetadata, runId: undefined } : undefined,
    }, {
      trigger: "retry",
      parentRunId: original.id,
    });
  }

  async cancel(runId: string): Promise<AgentRun> {
    const result = mutateAgentRunStore((store) => {
      const run = store.runs.find((item) => item.id === runId);
      if (!run) return null;
      if (TERMINAL_AGENT_RUN_STATUSES.has(run.status)) return cloneRun(run);
      run.status = "cancelled";
      run.finishedAt = new Date().toISOString();
      run.error = "Cancelled by user";
      return cloneRun(run);
    });
    if (!result) throw new AgentRunNotFoundError("Agent run not found");

    const active = this.active.get(runId);
    if (active?.session) {
      await active.session.abort().catch(() => {});
    }
    if (active) this.cleanup(runId);
    getAgentEventBus().publish(runId, { type: "failed", error: result.error || "Run cancelled" });
    this.drain();
    return result;
  }

  private updateRun(runId: string, status: AgentRunStatus, patch: Partial<AgentRun> = {}): void {
    mutateAgentRunStore((store) => {
      const run = store.runs.find((item) => item.id === runId);
      if (!run || TERMINAL_AGENT_RUN_STATUSES.has(run.status)) return;
      Object.assign(run, patch, { status });
    });
  }

  private drain(): void {
    if (this.draining || this.maxConcurrency <= 0) return;
    this.draining = true;
    try {
      while (this.active.size < this.maxConcurrency) {
        const reserved = mutateAgentRunStore((store) => {
          const run = [...store.runs].reverse().find((item) => item.status === "queued");
          if (!run) return null;
          run.status = "running";
          run.startedAt = new Date().toISOString();
          return cloneRun(run);
        });
        if (!reserved) break;
        getAgentEventBus().publish(reserved.id, { type: "run_started", runId: reserved.id });
        getAgentEventBus().publish(reserved.id, { type: "status", message: "Agent run started", state: "running" });
        this.active.set(reserved.id, {
          session: null,
          unsubscribe: null,
          keepAlive: null,
          timeout: null,
          waitingForInput: false,
        });
        void this.execute(reserved);
      }
    } finally {
      this.draining = false;
    }
  }

  private finish(runId: string, status: "completed" | "failed", error?: string, messages?: AgentMessage[]): void {
    if (!this.active.has(runId)) return;
    const existing = readAgentRunStore().runs.find((run) => run.id === runId);
    const finishedAt = new Date().toISOString();
    let meeting = existing?.agentMetadata?.agentType === "meeting" && existing.agentMetadata.runId
      ? readMeetingRun(existing.agentMetadata.runId)
      : null;
    let pm = existing?.agentMetadata?.agentType === "pm" && existing.agentMetadata.runId
      ? readPMRun(existing.agentMetadata.runId)
      : null;
    const domainResult = meeting ?? pm;
    const domainType = existing?.agentMetadata?.agentType;
    const requiresStructuredResult = domainType === "meeting" || domainType === "pm";
    const effectiveStatus = status === "completed" && requiresStructuredResult && domainResult?.status !== "completed"
      ? "failed"
      : status;
    const effectiveError = effectiveStatus === "failed" && !error && requiresStructuredResult
      ? `The ${domainType === "meeting" ? "Meeting" : "PM"} Agent finished without publishing a structured result`
      : error;
    if (effectiveStatus === "failed" && existing?.agentMetadata?.runId && domainResult?.status !== "completed") {
      if (domainType === "meeting") meeting = failMeetingRun(existing.agentMetadata.runId, effectiveError || "Meeting Agent run failed");
      if (domainType === "pm") pm = failPMRun(existing.agentMetadata.runId, effectiveError || "PM Agent run failed");
    }
    const result = meeting?.result ?? pm?.result ?? existing?.result;
    const artifacts = meeting?.artifacts ?? pm?.artifacts ?? existing?.artifacts;
    const actions = meeting?.actions ?? pm?.actions ?? existing?.actions;
    this.updateRun(runId, effectiveStatus, {
      finishedAt,
      ...(effectiveError ? { error: effectiveError } : {}),
      ...(messages ? { report: buildAgentRunReport(messages, existing?.startedAt, finishedAt) } : {}),
      ...(result !== undefined ? { result } : {}),
      ...(artifacts?.length ? { artifacts } : {}),
      ...(actions?.length ? { actions } : {}),
    });
    const eventBus = getAgentEventBus();
    for (const artifact of artifacts ?? []) {
      eventBus.publish(runId, { type: "artifact_created", artifactId: artifact.id, artifactType: artifact.type });
    }
    if (effectiveStatus === "completed") {
      eventBus.publish(runId, { type: "completed", result: result ?? null });
    } else {
      eventBus.publish(runId, { type: "failed", error: effectiveError || "Agent run failed" });
    }
    const memoryKey = existing?.agentMetadata ? conversationMemoryKey(existing.agentMetadata) : null;
    if (memoryKey) {
      void getMemoryStore().appendConversationMemory(memoryKey, {
        type: "agent_result",
        occurredAt: finishedAt,
        runId,
        agentId: existing?.agentMetadata?.agentId,
        status: effectiveStatus,
        ...(result !== undefined ? { result } : {}),
        ...(artifacts?.length ? { artifacts } : {}),
        ...(effectiveError ? { error: effectiveError } : {}),
      }).catch(() => {});
    }
    this.cleanup(runId);
    this.drain();
  }

  private cleanup(runId: string): void {
    const active = this.active.get(runId);
    if (!active) return;
    active.unsubscribe?.();
    if (active.keepAlive) clearInterval(active.keepAlive);
    if (active.timeout) clearTimeout(active.timeout);
    this.active.delete(runId);
  }

  private async execute(run: AgentRun): Promise<void> {
    const active = this.active.get(run.id);
    if (!active) return;
    try {
      if (!await isTrustedAgentRunWorkspace(run.cwd)) {
        throw new Error("Workspace is no longer trusted; open it as a project before retrying");
      }
      const started = await this.executionService.createSession({
        cwd: run.cwd,
        sessionId: `__daemon__${run.id}`,
        toolNames: run.toolNames,
        ...(run.agentMetadata ? { metadata: run.agentMetadata } : {}),
      });
      if (!this.active.has(run.id)) {
        await started.abort().catch(() => {});
        return;
      }
      active.session = started;
      this.updateRun(run.id, "running", {
        sessionId: started.sessionId,
        agentMetadata: started.metadata,
      });

      active.unsubscribe = started.subscribe((event) => {
        if (event.type === "waiting_for_input") {
          active.waitingForInput = true;
          this.updateRun(run.id, "waiting_for_input");
          getAgentEventBus().publish(run.id, event);
          void import("./web-push")
            .then(({ sendWebPush }) => sendWebPush(`/?session=${encodeURIComponent(started.sessionId)}`))
            .catch(() => {});
          return;
        }
        if (event.type === "status" && event.state === "running" && active.waitingForInput) {
          active.waitingForInput = false;
          this.updateRun(run.id, "running");
          getAgentEventBus().publish(run.id, event);
          return;
        }
        if (event.type === "failed") {
          void import("./web-push")
            .then(({ sendWebPush }) => sendWebPush(`/?session=${encodeURIComponent(started.sessionId)}`))
            .catch(() => {});
          this.finish(run.id, "failed", event.error);
          return;
        }
        if (event.type === "completed") {
          const messages = Array.isArray(event.result) ? event.result as AgentMessage[] : undefined;
          this.finish(run.id, "completed", undefined, messages);
          return;
        }
        if (event.type === "tool_started" || event.type === "tool_completed" || event.type === "status") {
          getAgentEventBus().publish(run.id, event);
        }
      });

      if (run.provider && run.modelId) {
        await started.send({
          type: "set_model",
          provider: run.provider,
          modelId: run.modelId,
        });
      }
      if (run.thinkingLevel) {
        await started.send({ type: "set_thinking_level", level: run.thinkingLevel });
      }

      active.keepAlive = setInterval(() => {
        void started.getState()
          .then((state) => {
            if (!state.running) this.finish(run.id, "failed", "The agent session closed before the run completed");
          })
          .catch((error) => this.finish(run.id, "failed", String(error)));
      }, KEEP_ALIVE_MS);
      active.keepAlive.unref?.();

      active.timeout = setTimeout(() => {
        void started.abort().catch(() => {});
        this.finish(run.id, "failed", "Agent run exceeded the 24-hour limit");
      }, MAX_RUN_MS);
      active.timeout.unref?.();

      await started.send({
        type: "prompt",
        message: run.prompt,
        awaitCompletion: true,
      });
      this.finish(run.id, "completed");
    } catch (error) {
      this.finish(run.id, "failed", error instanceof Error ? error.message : String(error));
    }
  }
}

declare global {
  var __piAgentRunSupervisor: AgentRunSupervisor | undefined;
}

export function ensureAgentRunSupervisor(): AgentRunSupervisor {
  if (!globalThis.__piAgentRunSupervisor) {
    globalThis.__piAgentRunSupervisor = new AgentRunSupervisor();
    globalThis.__piAgentRunSupervisor.start();
  }
  return globalThis.__piAgentRunSupervisor;
}
