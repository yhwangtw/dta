import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentExecutionService } from "../agents/agent-execution-service";
import { AgentRegistry } from "../agents/agent-registry";
import type { GenericAgentEvent } from "../agents/agent-types";
import type { AgentRuntime } from "../runtime/agent-runtime";

const directories: string[] = [];
const originalDataDir = process.env.DTA_DATA_DIR;
const originalEnabledAgents = process.env.DTA_ENABLED_AGENTS;

function dataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "dta-agent-execution-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DTA_DATA_DIR;
  else process.env.DTA_DATA_DIR = originalDataDir;
  if (originalEnabledAgents === undefined) delete process.env.DTA_ENABLED_AGENTS;
  else process.env.DTA_ENABLED_AGENTS = originalEnabledAgents;
});

describe("AgentExecutionService", () => {
  const send = vi.fn();
  const runtimeSend = vi.fn();
  const getState = vi.fn();
  const subscribe = vi.fn();
  const createSession = vi.fn();
  let runtime: AgentRuntime;

  beforeEach(() => {
    process.env.DTA_DATA_DIR = dataDir();
    process.env.DTA_ENABLED_AGENTS = "meeting-agent";
    send.mockReset().mockResolvedValue({ ok: true });
    runtimeSend.mockReset().mockResolvedValue(null);
    getState.mockReset().mockResolvedValue({ sessionId: "session-1", running: true });
    subscribe.mockReset().mockImplementation((_sessionId: string, _listener: (event: GenericAgentEvent) => void) => () => {});
    createSession.mockReset().mockResolvedValue({ sessionId: "session-1", send });
    runtime = { createSession, send: runtimeSend, getState, subscribe };
  });

  it("resolves canonical agent metadata before creating a runtime session", async () => {
    const service = new AgentExecutionService(runtime, new AgentRegistry());
    const handle = await service.createSession({
      cwd: "/tmp/meeting-space",
      metadata: {
        agentType: "meeting",
        agentId: "meeting-agent",
        displayName: "Untrusted display name",
        runId: "meeting-run-12345678",
      },
    });

    expect(handle.metadata.displayName).toBe("Meeting Agent");
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      cwd: "/tmp/meeting-space",
      metadata: expect.objectContaining({
        agentType: "meeting",
        agentId: "meeting-agent",
        displayName: "Meeting Agent",
      }),
    }));
  });

  it("applies model controls before sending the initial command", async () => {
    const service = new AgentExecutionService(runtime, new AgentRegistry());
    const result = await service.startSession({
      cwd: "/tmp/coding-space",
      agentId: "coding-agent",
      provider: "company",
      modelId: "reasoning-model",
      thinkingLevel: "high",
      command: { type: "prompt", message: "Hello" },
    });

    expect(send.mock.calls).toEqual([
      [{ type: "set_model", provider: "company", modelId: "reasoning-model" }],
      [{ type: "set_thinking_level", level: "high" }],
      [{ type: "prompt", message: "Hello" }],
    ]);
    expect(result.session.metadata.agentId).toBe("coding-agent");
  });

  it("rejects unknown or mismatched agents before calling the runtime", async () => {
    const service = new AgentExecutionService(runtime, new AgentRegistry());
    await expect(service.createSession({
      cwd: "/tmp/meeting-space",
      metadata: {
        agentType: "pm",
        agentId: "meeting-agent",
        displayName: "Meeting Agent",
      },
    })).rejects.toThrow("does not match");
    expect(createSession).not.toHaveBeenCalled();
  });
});
