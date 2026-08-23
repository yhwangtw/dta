import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunStore } from "../agent-run-types";

const harness = vi.hoisted(() => ({
  store: { version: 1, runs: [] } as AgentRunStore,
  persistError: null as Error | null,
  startRpcSession: vi.fn(),
  sessions: new Map<string, unknown>(),
  trusted: true,
}));

vi.mock("../agent-run-store", () => ({
  readAgentRunStore: vi.fn(() => harness.store),
  mutateAgentRunStore: vi.fn((mutate: (store: AgentRunStore) => unknown) => {
    if (harness.persistError) throw harness.persistError;
    return mutate(harness.store);
  }),
  reconcileInterruptedAgentRuns: vi.fn(() => 0),
}));

vi.mock("../rpc-manager", () => ({
  startRpcSession: async (...args: unknown[]) => {
    const started = await harness.startRpcSession(...args) as { realSessionId: string; session: unknown };
    harness.sessions.set(started.realSessionId, started.session);
    return started;
  },
  getRpcSession: vi.fn((sessionId: string) => harness.sessions.get(sessionId)),
}));

vi.mock("../agent-run-workspace", () => ({
  isTrustedAgentRunWorkspace: vi.fn(async () => harness.trusted),
}));

import { AgentRunSupervisor } from "../agent-run-supervisor";

interface FakeSession {
  isAlive: ReturnType<typeof vi.fn>;
  onEvent: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

function fakeSession() {
  const sink: { listener?: (event: { type: string; [key: string]: unknown }) => void } = {};
  const session: FakeSession = {
    isAlive: vi.fn(() => true),
    onEvent: vi.fn((listener) => {
      sink.listener = listener;
      return vi.fn();
    }),
    send: vi.fn((command: { type: string }) => (
      command.type === "prompt" ? new Promise(() => {}) : Promise.resolve(null)
    )),
  };
  return { session, emit: (event: { type: string; [key: string]: unknown }) => sink.listener?.(event) };
}

function input(name: string) {
  return {
    name,
    cwd: `/tmp/${name.toLowerCase()}`,
    prompt: `Implement ${name}`,
    toolNames: ["read", "grep"],
  };
}

beforeEach(() => {
  harness.store = { version: 1, runs: [] };
  harness.persistError = null;
  harness.startRpcSession.mockReset();
  harness.sessions.clear();
  harness.trusted = true;
});

describe("AgentRunSupervisor", () => {
  it("AC-2.1: keeps excess work queued until an active run finishes", async () => {
    const first = fakeSession();
    const second = fakeSession();
    harness.startRpcSession
      .mockResolvedValueOnce({ session: first.session, realSessionId: "session-1" })
      .mockResolvedValueOnce({ session: second.session, realSessionId: "session-2" });
    const supervisor = new AgentRunSupervisor({ maxConcurrency: 1 });

    const run1 = supervisor.enqueue(input("One"));
    const run2 = supervisor.enqueue(input("Two"));

    await vi.waitFor(() => expect(harness.store.runs.find((run) => run.id === run1.id)?.sessionId).toBe("session-1"));
    expect(harness.store.runs.find((run) => run.id === run2.id)?.status).toBe("queued");
    expect(harness.startRpcSession).toHaveBeenCalledTimes(1);

    first.emit({ type: "agent_end", messages: [{ role: "assistant", stopReason: "stop" }] });

    await vi.waitFor(() => expect(harness.startRpcSession).toHaveBeenCalledTimes(2));
    expect(harness.store.runs.find((run) => run.id === run1.id)?.status).toBe("completed");
    expect(harness.store.runs.find((run) => run.id === run2.id)?.status).toBe("running");
  });

  it("AC-2.2: tracks an unattended ask_user request without losing the run", async () => {
    const agent = fakeSession();
    harness.startRpcSession.mockResolvedValue({ session: agent.session, realSessionId: "session-question" });
    const supervisor = new AgentRunSupervisor({ maxConcurrency: 2 });
    const run = supervisor.enqueue(input("Question"));

    await vi.waitFor(() => expect(harness.store.runs.find((item) => item.id === run.id)?.sessionId).toBe("session-question"));
    agent.emit({ type: "extension_ui_request", id: "dialog-1", method: "ask_user", questions: [] });
    expect(harness.store.runs.find((item) => item.id === run.id)?.status).toBe("waiting_for_input");

    agent.emit({ type: "extension_ui_closed", id: "dialog-1", reason: "answered" });
    expect(harness.store.runs.find((item) => item.id === run.id)?.status).toBe("running");
  });

  it("AC-2.3: cancels queued work without starting a Pi session", async () => {
    const active = fakeSession();
    harness.startRpcSession.mockResolvedValue({ session: active.session, realSessionId: "session-active" });
    const supervisor = new AgentRunSupervisor({ maxConcurrency: 1 });
    supervisor.enqueue(input("Active"));
    const queued = supervisor.enqueue(input("Queued"));

    await vi.waitFor(() => expect(harness.startRpcSession).toHaveBeenCalledTimes(1));
    await supervisor.cancel(queued.id);

    expect(harness.store.runs.find((item) => item.id === queued.id)).toMatchObject({
      status: "cancelled",
    });
    expect(harness.startRpcSession).toHaveBeenCalledTimes(1);
  });

  it("AC-2.4: retries a terminal run with the same execution contract", () => {
    const supervisor = new AgentRunSupervisor({ maxConcurrency: 0 });
    const original = supervisor.enqueue({
      ...input("Retry"),
      provider: "openai",
      modelId: "gpt-5",
      thinkingLevel: "high",
    });
    harness.store.runs.find((item) => item.id === original.id)!.status = "failed";

    const retried = supervisor.retry(original.id);

    expect(retried).toMatchObject({
      name: "Retry",
      cwd: "/tmp/retry",
      prompt: "Implement Retry",
      provider: "openai",
      modelId: "gpt-5",
      thinkingLevel: "high",
      parentRunId: original.id,
      trigger: "retry",
      status: "queued",
    });
  });

  it("AC-2.5: refuses queued work when its workspace trust was revoked", async () => {
    harness.trusted = false;
    const supervisor = new AgentRunSupervisor({ maxConcurrency: 1 });
    const run = supervisor.enqueue(input("Revoked"));

    await vi.waitFor(() => expect(harness.store.runs.find((item) => item.id === run.id)).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/no longer trusted/),
    }));
    expect(harness.startRpcSession).not.toHaveBeenCalled();
  });

  it("AC-2.6: increasing the persisted concurrency starts queued work immediately", async () => {
    const first = fakeSession();
    const second = fakeSession();
    harness.startRpcSession
      .mockResolvedValueOnce({ session: first.session, realSessionId: "session-1" })
      .mockResolvedValueOnce({ session: second.session, realSessionId: "session-2" });
    const supervisor = new AgentRunSupervisor({ maxConcurrency: 1 });

    const run1 = supervisor.enqueue(input("One"));
    const run2 = supervisor.enqueue(input("Two"));
    await vi.waitFor(() => expect(harness.store.runs.find((run) => run.id === run1.id)?.sessionId).toBe("session-1"));
    expect(harness.store.runs.find((run) => run.id === run2.id)?.status).toBe("queued");

    supervisor.setMaxConcurrency(2);

    await vi.waitFor(() => expect(harness.store.runs.find((run) => run.id === run2.id)?.sessionId).toBe("session-2"));
    expect(supervisor.maxConcurrency).toBe(2);
    expect(harness.store.maxConcurrency).toBe(2);
  });

  it("AC-2.7: restores persisted concurrency when the daemon restarts", () => {
    harness.store = { version: 1, runs: [], maxConcurrency: 5 };

    const supervisor = new AgentRunSupervisor();

    expect(supervisor.maxConcurrency).toBe(5);
  });

  it("AC-2.8: lowering concurrency lets active runs finish before queued work starts", async () => {
    const first = fakeSession();
    const second = fakeSession();
    const third = fakeSession();
    harness.startRpcSession
      .mockResolvedValueOnce({ session: first.session, realSessionId: "session-1" })
      .mockResolvedValueOnce({ session: second.session, realSessionId: "session-2" })
      .mockResolvedValueOnce({ session: third.session, realSessionId: "session-3" });
    const supervisor = new AgentRunSupervisor({ maxConcurrency: 2 });

    const run1 = supervisor.enqueue(input("One"));
    const run2 = supervisor.enqueue(input("Two"));
    const run3 = supervisor.enqueue(input("Three"));
    await vi.waitFor(() => {
      expect(harness.store.runs.find((run) => run.id === run1.id)?.sessionId).toBe("session-1");
      expect(harness.store.runs.find((run) => run.id === run2.id)?.sessionId).toBe("session-2");
    });

    supervisor.setMaxConcurrency(1);

    expect(first.session.send).not.toHaveBeenCalledWith({ type: "abort" });
    expect(second.session.send).not.toHaveBeenCalledWith({ type: "abort" });
    expect(harness.store.runs.find((run) => run.id === run3.id)?.status).toBe("queued");

    first.emit({ type: "agent_end", messages: [{ role: "assistant", stopReason: "stop" }] });
    await vi.waitFor(() => {
      expect(harness.store.runs.find((run) => run.id === run1.id)?.status).toBe("completed");
    });
    expect(harness.startRpcSession).toHaveBeenCalledTimes(2);
    expect(harness.store.runs.find((run) => run.id === run3.id)?.status).toBe("queued");

    second.emit({ type: "agent_end", messages: [{ role: "assistant", stopReason: "stop" }] });
    await vi.waitFor(() => {
      expect(harness.store.runs.find((run) => run.id === run3.id)?.sessionId).toBe("session-3");
    });
  });

  it("AC-2.9: keeps the previous concurrency when persistence fails", () => {
    const supervisor = new AgentRunSupervisor({ maxConcurrency: 2 });
    harness.persistError = new Error("disk full");

    expect(() => supervisor.setMaxConcurrency(5)).toThrow("disk full");
    expect(supervisor.maxConcurrency).toBe(2);
  });

  it("AC-2.10: scopes request idempotency to the authenticated user and Agent", () => {
    const supervisor = new AgentRunSupervisor({ maxConcurrency: 0 });
    const common = {
      ...input("Contract"),
      requestId: "shared-request-id",
      agentMetadata: {
        agentType: "meeting" as const,
        agentId: "meeting-agent",
        displayName: "Meeting Agent",
      },
    };

    const first = supervisor.enqueue({ ...common, agentMetadata: { ...common.agentMetadata, userId: "user-1" } });
    const duplicate = supervisor.enqueue({ ...common, agentMetadata: { ...common.agentMetadata, userId: "user-1" } });
    const otherUser = supervisor.enqueue({ ...common, agentMetadata: { ...common.agentMetadata, userId: "user-2" } });

    expect(duplicate.id).toBe(first.id);
    expect(otherUser.id).not.toBe(first.id);
    expect(harness.store.runs).toHaveLength(2);
  });
});
