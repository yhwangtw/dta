import { loadDtaConfig } from "@/lib/config/env";
import type { AgentMetadata, AgentType } from "./agent-types";
import { loadAgentManifest } from "./agent-manifest";

export interface AgentSkillDefinition {
  id: string;
  name: string;
  description: string;
  tags: string[];
  inputModes: string[];
  outputModes: string[];
}

export interface AgentDefinition {
  id: string;
  agentType: AgentType;
  displayName: string;
  description: string;
  internal: boolean;
  enabledByDefault: boolean;
  skills: AgentSkillDefinition[];
  systemPrompt?: string;
  workflowAllowlist?: string[];
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
}

export interface AgentMetadataInput {
  agentId: string;
  runId?: string;
  userId?: string;
  projectId?: string;
  conversationId?: string;
}

export class AgentRegistryError extends Error {}

const BUILTIN_AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: "meeting-agent",
    agentType: "meeting",
    displayName: "Meeting Agent",
    description: "Turns meeting evidence into review-ready minutes, decisions, actions, and requirements.",
    internal: false,
    enabledByDefault: true,
    workflowAllowlist: ["meeting-pilot-readiness", "meeting-create-jira", "meeting-notify-teams", "meeting-update-knowledge-base"],
    skills: [{
      id: "meeting-minutes",
      name: "Meeting Intelligence",
      description: "Analyze text, transcripts, audio, and video evidence into structured meeting outcomes.",
      tags: ["meeting", "minutes", "decisions", "actions", "requirements"],
      inputModes: ["text/plain", "application/json", "audio/*", "video/*"],
      outputModes: ["text/markdown", "application/json"],
    }],
  },
  {
    id: "pm-agent",
    agentType: "pm",
    displayName: "PM Agent",
    description: "Transforms approved requirements into product and delivery artifacts.",
    internal: false,
    enabledByDefault: true,
    workflowAllowlist: ["pm-create-jira-epic", "pm-publish-prd", "pm-notify-team"],
    skills: [{
      id: "pm-analysis",
      name: "PM Analysis",
      description: "Create URDs, PRDs, user stories, acceptance criteria, design context, and task plans.",
      tags: ["requirements", "urd", "prd", "user-stories", "acceptance-criteria"],
      inputModes: ["text/plain", "application/json"],
      outputModes: ["text/markdown", "application/json"],
    }],
  },
  {
    id: "coding-agent",
    agentType: "coding",
    displayName: "Coding Agent",
    description: "Legacy internal coding capability backed by the existing Pi runtime.",
    internal: true,
    enabledByDefault: true,
    skills: [],
  },
];

function cloneDefinition(definition: AgentDefinition): AgentDefinition {
  return structuredClone(definition);
}

function defaultDefinitions(): AgentDefinition[] {
  const config = loadDtaConfig();
  return [
    ...BUILTIN_AGENT_DEFINITIONS,
    ...(config.agentManifestPath ? loadAgentManifest(config.agentManifestPath) : []),
  ];
}

export class AgentRegistry {
  private readonly definitions: Map<string, AgentDefinition>;

  constructor(definitions: AgentDefinition[] = defaultDefinitions()) {
    this.definitions = new Map();
    for (const definition of definitions) {
      if (!definition.id.trim()) throw new AgentRegistryError("Agent definition id is required");
      if (this.definitions.has(definition.id)) throw new AgentRegistryError(`Duplicate agent definition: ${definition.id}`);
      this.definitions.set(definition.id, cloneDefinition(definition));
    }
  }

  list(options: { includeDisabled?: boolean; includeInternal?: boolean } = {}): AgentDefinition[] {
    const config = loadDtaConfig();
    const enabled = new Set(config.enabledAgentIds);
    return [...this.definitions.values()]
      .filter((definition) => options.includeInternal || !definition.internal)
      .filter((definition) => options.includeDisabled
        || definition.internal
        || (config.enabledAgentIdsExplicit ? enabled.has(definition.id) : definition.enabledByDefault))
      .map(cloneDefinition);
  }

  get(agentId: string): AgentDefinition | null {
    const definition = this.definitions.get(agentId);
    return definition ? cloneDefinition(definition) : null;
  }

  require(agentId: string, options: { allowInternal?: boolean; allowDisabled?: boolean } = {}): AgentDefinition {
    const definition = this.definitions.get(agentId);
    if (!definition) throw new AgentRegistryError(`Unknown agent: ${agentId}`);
    if (definition.internal && !options.allowInternal) throw new AgentRegistryError(`Agent is internal: ${agentId}`);
    const config = loadDtaConfig();
    const enabled = new Set(config.enabledAgentIds);
    const isEnabled = config.enabledAgentIdsExplicit ? enabled.has(agentId) : definition.enabledByDefault;
    if (!definition.internal && !options.allowDisabled && !isEnabled) {
      throw new AgentRegistryError(`Agent is disabled: ${agentId}`);
    }
    return cloneDefinition(definition);
  }

  createMetadata(input: AgentMetadataInput, options: { allowInternal?: boolean; allowDisabled?: boolean } = {}): AgentMetadata {
    const definition = this.require(input.agentId, options);
    return {
      agentType: definition.agentType,
      agentId: definition.id,
      displayName: definition.displayName,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    };
  }

  normalizeMetadata(metadata: AgentMetadata, options: { allowInternal?: boolean; allowDisabled?: boolean } = {}): AgentMetadata {
    const definition = this.require(metadata.agentId, options);
    if (definition.agentType !== metadata.agentType) {
      throw new AgentRegistryError(`Agent type does not match registry definition: ${metadata.agentId}`);
    }
    return this.createMetadata(metadata, options);
  }
}

let defaultRegistry: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  defaultRegistry ??= new AgentRegistry();
  return defaultRegistry;
}

export function resetAgentRegistryForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Agent Registry reset is test-only");
  defaultRegistry = null;
}
