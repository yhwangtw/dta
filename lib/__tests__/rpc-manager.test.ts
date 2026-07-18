import { describe, expect, it, vi } from "vitest";
import { AgentSessionWrapper } from "../rpc-manager";
import type { AgentSessionLike } from "../pi-types";

describe("AgentSessionWrapper compact command", () => {
  it("delegates repeated-compaction eligibility to Pi", async () => {
    const compactResult = {
      summary: "updated summary",
      firstKeptEntryId: "kept-2",
      tokensBefore: 42_000,
      estimatedTokensAfter: 12_000,
    };
    const compact = vi.fn().mockResolvedValue(compactResult);
    const inner = {
      sessionId: "session-1",
      sessionFile: "/tmp/session-1.jsonl",
      sessionManager: {
        // The old web pre-check rejects this shape before Pi gets a chance to
        // apply its firstKeptEntryId-aware repeated-compaction logic.
        getBranch: () => [
          {
            type: "compaction",
            id: "compact-1",
            firstKeptEntryId: "kept-1",
          },
          { type: "message", id: "new-user", message: { role: "user", content: "continue" } },
        ],
      },
      settingsManager: {
        getCompactionSettings: () => ({ enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 }),
      },
      compact,
      dispose: vi.fn(),
    } as unknown as AgentSessionLike;
    const wrapper = new AgentSessionWrapper(inner);

    try {
      await expect(wrapper.send({ type: "compact", customInstructions: "focus on decisions" }))
        .resolves.toEqual(compactResult);
      expect(compact).toHaveBeenCalledWith("focus on decisions");
    } finally {
      wrapper.destroy();
    }
  });
});

describe("AgentSessionWrapper model catalog refresh", () => {
  it("refreshes persisted auth and models before resolving a model change", async () => {
    const model = { id: "gpt-5.6-luna", provider: "openai-codex" };
    let refreshed = false;
    const find = vi.fn(() => refreshed ? model : undefined);
    const setModel = vi.fn().mockResolvedValue(undefined);
    const inner = {
      sessionId: "session-1",
      sessionFile: "/tmp/session-1.jsonl",
      modelRegistry: { find },
      setModel,
      dispose: vi.fn(),
    } as unknown as AgentSessionLike;
    const refreshModels = vi.fn(() => { refreshed = true; });
    const wrapper = new AgentSessionWrapper(inner, "", undefined, [], refreshModels);

    try {
      await expect(wrapper.send({
        type: "set_model",
        provider: "openai-codex",
        modelId: "gpt-5.6-luna",
      })).resolves.toEqual(model);
      expect(refreshModels).toHaveBeenCalledOnce();
      expect(find).toHaveBeenCalledWith("openai-codex", "gpt-5.6-luna");
      expect(setModel).toHaveBeenCalledWith(model);
    } finally {
      wrapper.destroy();
    }
  });
});

describe("AgentSessionWrapper extension lifecycle", () => {
  it("emits session_shutdown before disposing the session", async () => {
    const calls: string[] = [];
    const emit = vi.fn(async (event: { type: string; reason: string }) => {
      calls.push(`${event.type}:${event.reason}`);
      return [];
    });
    const inner = {
      sessionId: "session-1",
      sessionFile: "/tmp/session-1.jsonl",
      extensionRunner: { emit },
      dispose: vi.fn(() => calls.push("dispose")),
    } as unknown as AgentSessionLike;
    const wrapper = new AgentSessionWrapper(inner);

    await wrapper.shutdown("reload");

    expect(emit).toHaveBeenCalledWith({ type: "session_shutdown", reason: "reload" });
    expect(calls).toEqual(["session_shutdown:reload", "dispose"]);
    expect(wrapper.isAlive()).toBe(false);
  });

  it("reloads extensions only while the session is idle", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const busyInner = {
      sessionId: "session-busy",
      sessionFile: "/tmp/session-busy.jsonl",
      isStreaming: true,
      isCompacting: false,
      reload,
      dispose: vi.fn(),
    } as unknown as AgentSessionLike;
    const idleInner = {
      ...busyInner,
      sessionId: "session-idle",
      isStreaming: false,
    } as unknown as AgentSessionLike;

    const busy = new AgentSessionWrapper(busyInner);
    const idle = new AgentSessionWrapper(idleInner);
    try {
      await expect(busy.reloadExtensions()).rejects.toThrow("idle");
      await expect(idle.reloadExtensions()).resolves.toBeUndefined();
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      busy.destroy();
      idle.destroy();
    }
  });
});
