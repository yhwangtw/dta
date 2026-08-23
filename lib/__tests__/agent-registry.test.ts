import { afterEach, describe, expect, it } from "vitest";
import { AgentRegistry, AgentRegistryError } from "../agents/agent-registry";

const originalEnabledAgents = process.env.DTA_ENABLED_AGENTS;

afterEach(() => {
  if (originalEnabledAgents === undefined) delete process.env.DTA_ENABLED_AGENTS;
  else process.env.DTA_ENABLED_AGENTS = originalEnabledAgents;
});

describe("AgentRegistry", () => {
  it("publishes only enabled public agents by default", () => {
    delete process.env.DTA_ENABLED_AGENTS;
    const registry = new AgentRegistry();

    expect(registry.list().map((agent) => agent.id)).toEqual(["meeting-agent", "pm-agent"]);
    expect(registry.list({ includeDisabled: true }).map((agent) => agent.id)).toEqual([
      "meeting-agent",
      "pm-agent",
    ]);
    expect(registry.list({ includeDisabled: true, includeInternal: true }).map((agent) => agent.id))
      .toEqual(["meeting-agent", "pm-agent", "coding-agent"]);
  });

  it("enables configured domain agents without exposing the internal Coding Agent", () => {
    process.env.DTA_ENABLED_AGENTS = "meeting-agent, pm-agent,meeting-agent";
    const registry = new AgentRegistry();

    expect(registry.list().map((agent) => agent.id)).toEqual(["meeting-agent", "pm-agent"]);
    expect(() => registry.require("coding-agent")).toThrow("internal");
    expect(registry.require("coding-agent", { allowInternal: true }).agentType).toBe("coding");
  });

  it("creates canonical metadata and rejects identity spoofing", () => {
    const registry = new AgentRegistry();
    expect(registry.createMetadata({
      agentId: "meeting-agent",
      runId: "meeting-run-12345678",
      userId: "user-1",
    })).toEqual({
      agentType: "meeting",
      agentId: "meeting-agent",
      displayName: "Meeting Agent",
      runId: "meeting-run-12345678",
      userId: "user-1",
    });

    expect(() => registry.normalizeMetadata({
      agentType: "pm",
      agentId: "meeting-agent",
      displayName: "Spoofed",
    })).toThrow("does not match");
    expect(() => registry.require("unknown-agent")).toThrow(AgentRegistryError);
  });
});
