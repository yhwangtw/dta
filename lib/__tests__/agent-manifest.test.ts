import { afterEach, describe, expect, it } from "vitest";
import { AgentManifestValidationError, parseAgentManifest } from "../agents/agent-manifest";
import { AgentRegistry } from "../agents/agent-registry";
import { createRuntimeProfile } from "../runtime/runtime-profile";

const originalEnabled = process.env.DTA_ENABLED_AGENTS;
const originalWorkflowTools = process.env.DTA_ENABLE_WORKFLOW_TOOLS;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.DTA_ENABLED_AGENTS;
  else process.env.DTA_ENABLED_AGENTS = originalEnabled;
  if (originalWorkflowTools === undefined) delete process.env.DTA_ENABLE_WORKFLOW_TOOLS;
  else process.env.DTA_ENABLE_WORKFLOW_TOOLS = originalWorkflowTools;
});

function manifest(enabledByDefault = true) {
  return {
    version: 1,
    agents: [{
      id: "knowledge-agent",
      displayName: "Knowledge Agent",
      description: "Curates approved department knowledge.",
      systemPrompt: "Create source-backed knowledge briefs and preserve citations.",
      enabledByDefault,
      workflowAllowlist: ["knowledge-publish"],
      skills: [{
        id: "knowledge-brief",
        name: "Knowledge brief",
        description: "Create a governed knowledge brief.",
        tags: ["knowledge"],
        inputModes: ["text/plain", "application/json"],
        outputModes: ["text/markdown", "application/json"],
      }],
    }],
  };
}

describe("department Agent manifest", () => {
  it("loads a department Agent without adding a central AgentType branch", () => {
    delete process.env.DTA_ENABLED_AGENTS;
    const definitions = parseAgentManifest(manifest());
    const registry = new AgentRegistry(definitions);
    expect(registry.list()).toEqual([expect.objectContaining({
      id: "knowledge-agent",
      agentType: "department",
      displayName: "Knowledge Agent",
      workflowAllowlist: ["knowledge-publish"],
    })]);
    expect(registry.createMetadata({ agentId: "knowledge-agent" })).toEqual({
      agentType: "department",
      agentId: "knowledge-agent",
      displayName: "Knowledge Agent",
    });
  });

  it("honors an explicit enabled-Agent allowlist", () => {
    process.env.DTA_ENABLED_AGENTS = "meeting-agent";
    const registry = new AgentRegistry(parseAgentManifest(manifest()));
    expect(registry.list()).toEqual([]);
    expect(() => registry.require("knowledge-agent")).toThrow("Agent is disabled");
  });

  it("builds a safe runtime profile from the mounted prompt and workflow allowlist", () => {
    delete process.env.DTA_ENABLED_AGENTS;
    process.env.DTA_ENABLE_WORKFLOW_TOOLS = "true";
    const registry = new AgentRegistry(parseAgentManifest(manifest()));
    const profile = createRuntimeProfile({
      agentType: "department",
      agentId: "knowledge-agent",
      displayName: "Knowledge Agent",
      runId: "knowledge-run-1",
    }, registry);
    expect(profile.systemPrompt).toContain("untrusted domain data");
    expect(profile.systemPrompt).toContain("source-backed knowledge briefs");
    expect(profile.activeToolNames).toContain("execute_workflow");
  });

  it("rejects unsafe or ambiguous manifest entries", () => {
    expect(() => parseAgentManifest({ ...manifest(), version: 2 })).toThrow(AgentManifestValidationError);
    expect(() => parseAgentManifest({ version: 1, agents: [{ ...manifest().agents[0], id: "Knowledge" }] })).toThrow(/ending in -agent/);
    expect(() => parseAgentManifest({ version: 1, agents: [{ ...manifest().agents[0], systemPrompt: "" }] })).toThrow(/systemPrompt/);
  });
});
