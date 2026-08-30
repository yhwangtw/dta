import { readFileSync } from "node:fs";
import type { AgentDefinition, AgentSkillDefinition } from "./agent-registry";

export interface DepartmentAgentManifest {
  version: 1 | 2;
  agents: Array<{
    id: string;
    displayName: string;
    description: string;
    systemPrompt: string;
    enabledByDefault?: boolean;
    workflowAllowlist?: string[];
    skills?: AgentSkillDefinition[];
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    artifactTypes?: string[];
    reviewPolicy?: "none" | "required";
    allowedRoles?: string[];
    modelPolicy?: {
      allowedProviders?: string[];
      allowedModels?: string[];
      maxOutputTokens?: number;
      timeoutSeconds?: number;
    };
    evaluationFixtures?: Array<{
      name: string;
      input: Record<string, unknown>;
      expectedPaths: string[];
    }>;
  }>;
}

export class AgentManifestValidationError extends Error {}

const JSON_SCHEMA_TYPES = new Set(["null", "boolean", "object", "array", "number", "integer", "string"]);

interface SchemaValidationState {
  nodes: number;
}

function schemaRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function schemaStringArray(value: unknown, field: string, allowEmpty = true): void {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((entry) => typeof entry !== "string")) {
    throw new AgentManifestValidationError(`${field} must be ${allowEmpty ? "an" : "a non-empty"} array of strings`);
  }
  if (new Set(value).size !== value.length) throw new AgentManifestValidationError(`${field} must not contain duplicates`);
}

function validateSchemaNode(value: unknown, field: string, state: SchemaValidationState, depth = 0): void {
  if (typeof value === "boolean") return;
  if (!schemaRecord(value)) throw new AgentManifestValidationError(`${field} must be a JSON Schema object or boolean`);
  state.nodes += 1;
  if (depth > 32 || state.nodes > 2_000) throw new AgentManifestValidationError(`${field} exceeds the supported JSON Schema complexity`);

  if (value.type !== undefined) {
    const types = typeof value.type === "string" ? [value.type] : value.type;
    if (!Array.isArray(types) || types.length === 0 || types.some((entry) => typeof entry !== "string" || !JSON_SCHEMA_TYPES.has(entry))) {
      throw new AgentManifestValidationError(`${field}.type contains an unsupported JSON Schema type`);
    }
    if (new Set(types).size !== types.length) throw new AgentManifestValidationError(`${field}.type must not contain duplicates`);
  }

  for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
    const candidates = value[keyword];
    if (candidates === undefined) continue;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new AgentManifestValidationError(`${field}.${keyword} must be a non-empty array of schemas`);
    }
    candidates.forEach((candidate, index) => validateSchemaNode(candidate, `${field}.${keyword}[${index}]`, state, depth + 1));
  }

  for (const keyword of ["not", "if", "then", "else", "contains", "propertyNames", "items", "additionalItems", "additionalProperties", "unevaluatedItems", "unevaluatedProperties"] as const) {
    if (value[keyword] !== undefined) validateSchemaNode(value[keyword], `${field}.${keyword}`, state, depth + 1);
  }

  const schemaMaps = ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"] as const;
  for (const keyword of schemaMaps) {
    const candidates = value[keyword];
    if (candidates === undefined) continue;
    if (!schemaRecord(candidates)) throw new AgentManifestValidationError(`${field}.${keyword} must be an object of schemas`);
    for (const [name, candidate] of Object.entries(candidates)) {
      if (keyword === "patternProperties") {
        try { new RegExp(name, "u"); }
        catch { throw new AgentManifestValidationError(`${field}.${keyword} contains an invalid regular expression`); }
      }
      validateSchemaNode(candidate, `${field}.${keyword}.${name}`, state, depth + 1);
    }
  }

  if (value.prefixItems !== undefined) {
    if (!Array.isArray(value.prefixItems)) throw new AgentManifestValidationError(`${field}.prefixItems must be an array of schemas`);
    value.prefixItems.forEach((candidate, index) => validateSchemaNode(candidate, `${field}.prefixItems[${index}]`, state, depth + 1));
  }
  if (value.required !== undefined) schemaStringArray(value.required, `${field}.required`);
  if (value.dependentRequired !== undefined) {
    if (!schemaRecord(value.dependentRequired)) throw new AgentManifestValidationError(`${field}.dependentRequired must be an object`);
    for (const [name, entries] of Object.entries(value.dependentRequired)) schemaStringArray(entries, `${field}.dependentRequired.${name}`);
  }
  if (value.enum !== undefined && (!Array.isArray(value.enum) || value.enum.length === 0)) {
    throw new AgentManifestValidationError(`${field}.enum must be a non-empty array`);
  }

  for (const keyword of ["minLength", "maxLength", "minItems", "maxItems", "minContains", "maxContains", "minProperties", "maxProperties"] as const) {
    const candidate = value[keyword];
    if (candidate !== undefined && (!Number.isInteger(candidate) || (candidate as number) < 0)) {
      throw new AgentManifestValidationError(`${field}.${keyword} must be a non-negative integer`);
    }
  }
  for (const keyword of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"] as const) {
    const candidate = value[keyword];
    if (candidate !== undefined && (typeof candidate !== "number" || !Number.isFinite(candidate))) {
      throw new AgentManifestValidationError(`${field}.${keyword} must be a finite number`);
    }
  }
  if (value.multipleOf !== undefined && (typeof value.multipleOf !== "number" || !Number.isFinite(value.multipleOf) || value.multipleOf <= 0)) {
    throw new AgentManifestValidationError(`${field}.multipleOf must be a positive finite number`);
  }
  if (value.pattern !== undefined) {
    if (typeof value.pattern !== "string") throw new AgentManifestValidationError(`${field}.pattern must be a string`);
    try { new RegExp(value.pattern, "u"); }
    catch { throw new AgentManifestValidationError(`${field}.pattern is not a valid regular expression`); }
  }
  for (const keyword of ["$id", "$schema", "$ref", "$dynamicRef", "$anchor", "$dynamicAnchor", "format", "title", "description", "$comment"] as const) {
    if (value[keyword] !== undefined && typeof value[keyword] !== "string") {
      throw new AgentManifestValidationError(`${field}.${keyword} must be a string`);
    }
  }
}

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

function jsonSchema(value: unknown, field: string, required: boolean): Record<string, unknown> | undefined {
  if (value === undefined && !required) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentManifestValidationError(`${field} must be a JSON Schema object`);
  const schema = structuredClone(value as Record<string, unknown>);
  let serialized: string;
  try { serialized = JSON.stringify(schema); }
  catch { throw new AgentManifestValidationError(`${field} must be serializable JSON`); }
  if (serialized.length > 100_000) throw new AgentManifestValidationError(`${field} exceeds 100000 characters`);
  if (schema.type === undefined && !Array.isArray(schema.oneOf) && !Array.isArray(schema.anyOf) && !Array.isArray(schema.allOf) && typeof schema.$ref !== "string") {
    throw new AgentManifestValidationError(`${field} must declare type, oneOf, anyOf, allOf, or $ref`);
  }
  validateSchemaNode(schema, field, { nodes: 0 });
  return schema;
}

function parseModelPolicy(value: unknown, field: string): AgentDefinition["modelPolicy"] {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentManifestValidationError(`${field} must be an object`);
  const policy = value as Record<string, unknown>;
  const bounded = (candidate: unknown, name: string, minimum: number, maximum: number) => {
    if (candidate === undefined) return undefined;
    if (!Number.isInteger(candidate) || (candidate as number) < minimum || (candidate as number) > maximum) {
      throw new AgentManifestValidationError(`${field}.${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return candidate as number;
  };
  return {
    allowedProviders: stringList(policy.allowedProviders, `${field}.allowedProviders`, 20),
    allowedModels: stringList(policy.allowedModels, `${field}.allowedModels`, 50),
    ...(policy.maxOutputTokens === undefined ? {} : { maxOutputTokens: bounded(policy.maxOutputTokens, "maxOutputTokens", 128, 200_000) }),
    ...(policy.timeoutSeconds === undefined ? {} : { timeoutSeconds: bounded(policy.timeoutSeconds, "timeoutSeconds", 10, 7_200) }),
  };
}

function parseEvaluationFixtures(value: unknown, field: string): NonNullable<AgentDefinition["evaluationFixtures"]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) throw new AgentManifestValidationError(`${field} must contain at most 50 items`);
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new AgentManifestValidationError(`${field}[${index}] must be an object`);
    const fixture = candidate as Record<string, unknown>;
    if (!fixture.input || typeof fixture.input !== "object" || Array.isArray(fixture.input)) throw new AgentManifestValidationError(`${field}[${index}].input must be an object`);
    return {
      name: requiredString(fixture.name, `${field}[${index}].name`, 200),
      input: structuredClone(fixture.input as Record<string, unknown>),
      expectedPaths: stringList(fixture.expectedPaths, `${field}[${index}].expectedPaths`, 100),
    };
  });
}

export function parseAgentManifest(value: unknown): AgentDefinition[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentManifestValidationError("Agent manifest must be an object");
  const manifest = value as Partial<DepartmentAgentManifest>;
  if (manifest.version !== 1 && manifest.version !== 2) throw new AgentManifestValidationError("Agent manifest version must be 1 or 2");
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
    const outputSchema = jsonSchema(item.outputSchema, `agents[${index}].outputSchema`, manifest.version === 2);
    const inputSchema = jsonSchema(item.inputSchema, `agents[${index}].inputSchema`, false);
    const modelPolicy = parseModelPolicy(item.modelPolicy, `agents[${index}].modelPolicy`);
    const reviewPolicy = item.reviewPolicy === undefined ? "required" : item.reviewPolicy;
    if (reviewPolicy !== "none" && reviewPolicy !== "required") throw new AgentManifestValidationError(`agents[${index}].reviewPolicy must be none or required`);
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
      ...(inputSchema ? { inputSchema } : {}),
      outputSchema: outputSchema ?? { type: "object", additionalProperties: true },
      artifactTypes: stringList(item.artifactTypes, `agents[${index}].artifactTypes`, 50),
      reviewPolicy,
      allowedRoles: stringList(item.allowedRoles, `agents[${index}].allowedRoles`, 50),
      ...(modelPolicy ? { modelPolicy } : {}),
      evaluationFixtures: parseEvaluationFixtures(item.evaluationFixtures, `agents[${index}].evaluationFixtures`),
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
