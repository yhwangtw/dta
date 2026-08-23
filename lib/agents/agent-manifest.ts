import { readFileSync } from "node:fs";
import type { AgentDefinition, AgentSkillDefinition } from "./agent-registry";

export interface DepartmentAgentManifest {
  version: 1;
  agents: Array<{
    id: string;
    displayName: string;
    description: string;
    systemPrompt: string;
    enabledByDefault?: boolean;
    workflowAllowlist?: string[];
    skills?: AgentSkillDefinition[];
  }>;
}

export class AgentManifestValidationError extends Error {}

function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim()) throw new AgentManifestValidationError(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new AgentManifestValidationError(`${field} exceeds ${maximum} characters`);
  return normalized;
}

function stringList(value: unknown, field: string, maximumItems: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) throw new AgentManifestValidationError(`${field} must be an array with at most ${maximumItems} items`);
  return [...new Set(value.map((entry, index) => requiredString(entry, `${field}[${index}]`, 200)))];
}

function parseSkill(value: unknown, agentIndex: number, skillIndex: number): AgentSkillDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentManifestValidationError(`agents[${agentIndex}].skills[${skillIndex}] must be an object`);
  }
  const skill = value as Record<string, unknown>;
  const id = requiredString(skill.id, `agents[${agentIndex}].skills[${skillIndex}].id`, 100);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new AgentManifestValidationError(`Invalid skill id: ${id}`);
  return {
    id,
    name: requiredString(skill.name, `agents[${agentIndex}].skills[${skillIndex}].name`, 160),
    description: requiredString(skill.description, `agents[${agentIndex}].skills[${skillIndex}].description`, 2_000),
    tags: stringList(skill.tags, `agents[${agentIndex}].skills[${skillIndex}].tags`, 30),
    inputModes: stringList(skill.inputModes, `agents[${agentIndex}].skills[${skillIndex}].inputModes`, 20),
    outputModes: stringList(skill.outputModes, `agents[${agentIndex}].skills[${skillIndex}].outputModes`, 20),
  };
}

export function parseAgentManifest(value: unknown): AgentDefinition[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentManifestValidationError("Agent manifest must be an object");
  const manifest = value as Partial<DepartmentAgentManifest>;
  if (manifest.version !== 1) throw new AgentManifestValidationError("Agent manifest version must be 1");
  if (!Array.isArray(manifest.agents) || manifest.agents.length > 100) throw new AgentManifestValidationError("agents must be an array with at most 100 items");
  return manifest.agents.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AgentManifestValidationError(`agents[${index}] must be an object`);
    const item = raw as unknown as Record<string, unknown>;
    const id = requiredString(item.id, `agents[${index}].id`, 64);
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id) || !id.endsWith("-agent")) {
      throw new AgentManifestValidationError(`Agent id must be a lowercase kebab-case value ending in -agent: ${id}`);
    }
    const skills = item.skills === undefined
      ? []
      : Array.isArray(item.skills) && item.skills.length <= 30
        ? item.skills.map((skill, skillIndex) => parseSkill(skill, index, skillIndex))
        : (() => { throw new AgentManifestValidationError(`agents[${index}].skills must contain at most 30 items`); })();
    return {
      id,
      agentType: "department" as const,
      displayName: requiredString(item.displayName, `agents[${index}].displayName`, 160),
      description: requiredString(item.description, `agents[${index}].description`, 2_000),
      internal: false,
      enabledByDefault: item.enabledByDefault === true,
      systemPrompt: requiredString(item.systemPrompt, `agents[${index}].systemPrompt`, 100_000),
      workflowAllowlist: stringList(item.workflowAllowlist, `agents[${index}].workflowAllowlist`, 50),
      skills,
    };
  });
}

export function loadAgentManifest(path: string): AgentDefinition[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new AgentManifestValidationError(`Unable to read Agent manifest ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseAgentManifest(parsed);
}
