import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("rejects malformed JSON Schemas while loading the manifest", () => {
    const base = { ...manifest().agents[0] };
    expect(() => parseAgentManifest({ version: 2, agents: [{ ...base, outputSchema: { type: "banana" } }] })).toThrow(/unsupported JSON Schema type/);
    expect(() => parseAgentManifest({ version: 2, agents: [{ ...base, outputSchema: { type: "object", properties: [] } }] })).toThrow(/properties must be an object/);
    expect(() => parseAgentManifest({ version: 2, agents: [{ ...base, outputSchema: { type: "string", pattern: "[" } }] })).toThrow(/valid regular expression/);
    expect(() => parseAgentManifest({ version: 2, agents: [{ ...base, outputSchema: { oneOf: [] } }] })).toThrow(/non-empty array/);
  });

  it("loads the governed version 2 contract and model policy", () => {
    const v2 = {
      ...manifest(),
      version: 2,
      agents: [{
        ...manifest().agents[0],
        inputSchema: { type: "object", required: ["topic"], properties: { topic: { type: "string" } } },
        outputSchema: { type: "object", required: ["brief"], properties: { brief: { type: "string" } }, additionalProperties: false },
        artifactTypes: ["KNOWLEDGE_BRIEF"],
        reviewPolicy: "required",
        allowedRoles: ["dta-knowledge"],
        modelPolicy: { allowedProviders: ["company"], allowedModels: ["approved-model"], maxOutputTokens: 4096, timeoutSeconds: 300 },
        evaluationFixtures: [{ name: "baseline", input: { topic: "pilot" }, expectedPaths: ["brief"] }],
      }],
    };
    expect(parseAgentManifest(v2)).toEqual([expect.objectContaining({
      id: "knowledge-agent",
      inputSchema: expect.objectContaining({ type: "object" }),
      outputSchema: expect.objectContaining({ required: ["brief"] }),
      artifactTypes: ["KNOWLEDGE_BRIEF"],
      reviewPolicy: "required",
      allowedRoles: ["dta-knowledge"],
      modelPolicy: expect.objectContaining({ maxOutputTokens: 4096, timeoutSeconds: 300 }),
      evaluationFixtures: [{ name: "baseline", input: { topic: "pilot" }, expectedPaths: ["brief"] }],
    })]);
  });

  it("keeps the checked-in mounted-Agent example valid", () => {
    const example = JSON.parse(readFileSync(resolve(process.cwd(), "config/agents.example.json"), "utf8"));
    expect(parseAgentManifest(example)).toEqual([expect.objectContaining({
      id: "knowledge-agent",
      reviewPolicy: "required",
      allowedRoles: ["dta-knowledge"],
      artifactTypes: ["KNOWLEDGE_BRIEF"],
    })]);
  });
});
