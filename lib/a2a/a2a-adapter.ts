import type { AgentRun, AgentRunStatus } from "@/lib/agent-run-types";
import { getAgentContractService } from "@/lib/agents/agent-contract-service";
import { AgentRequestValidationError, parseAgentRequest, type AgentRequest } from "@/lib/agents/agent-contract";
import { releasedActionsForAgentRun, reviewForAgentRun } from "@/lib/agents/agent-contract";
import type { GenericAgentEvent } from "@/lib/agents/agent-types";
import { resolveActingUserId, type RequestPrincipal } from "@/lib/auth/request-auth";
import { loadDtaConfig } from "@/lib/config/env";
import { artifactToA2A, type A2AMessage, type A2ASendMessageRequest, type A2ATask, type A2ATaskState } from "./a2a-types";
import { getAgentRegistry } from "@/lib/agents/agent-registry";

export class A2AValidationError extends Error {
  constructor(message: string, readonly code = "INVALID_ARGUMENT") { super(message); }
}

export function agentRunStatusToA2ATaskState(status: AgentRunStatus): A2ATaskState {
  if (status === "queued") return "TASK_STATE_SUBMITTED";
  if (status === "running") return "TASK_STATE_WORKING";
  if (status === "waiting_for_input") return "TASK_STATE_INPUT_REQUIRED";
  if (status === "completed") return "TASK_STATE_COMPLETED";
  if (status === "cancelled") return "TASK_STATE_CANCELED";
  return "TASK_STATE_FAILED";
}

function defaultAgentAlias(): string {
  return loadDtaConfig().defaultAgentId;
}

function selectedAgent(message: A2AMessage): string {
  const metadataAgent = message.metadata?.agentId ?? message.metadata?.skillId;
  const dataAgent = message.parts
    .map((part) => part.data)
    .find((data) => Boolean(data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>).agentId));
  const requested = typeof metadataAgent === "string"
    ? metadataAgent
    : dataAgent && typeof (dataAgent as Record<string, unknown>).agentId === "string"
      ? String((dataAgent as Record<string, unknown>).agentId)
      : defaultAgentAlias();
  const registry = getAgentRegistry();
  const direct = registry.get(requested);
  const suffixed = requested.endsWith("-agent") ? null : registry.get(`${requested}-agent`);
  const definition = direct ?? suffixed;
  if (!definition || definition.internal) throw new A2AValidationError(`Unsupported DTA agent: ${requested}`);
  return requested;
}

export function parseA2ASendMessage(value: unknown, principal: RequestPrincipal): { agentAlias: string; request: AgentRequest } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new A2AValidationError("A2A request must be a JSON object");
  const envelope = value as Partial<A2ASendMessageRequest>;
  const message = envelope.message;
  if (!message || typeof message !== "object" || message.role !== "ROLE_USER") throw new A2AValidationError("message.role must be ROLE_USER");
  if (typeof message.messageId !== "string" || !message.messageId.trim() || message.messageId.length > 200) throw new A2AValidationError("message.messageId is required and must be at most 200 characters");
  if (!Array.isArray(message.parts) || message.parts.length === 0 || message.parts.length > 100) throw new A2AValidationError("message.parts must contain between 1 and 100 parts");
  if (message.parts.some((part) => !part || typeof part !== "object" || typeof part.raw === "string" || typeof part.url === "string")) {
    throw new A2AValidationError("Inline and remote file parts are not fetched; upload Meeting media through /api/meeting-agent/extract and pass artifact references", "CONTENT_TYPE_NOT_SUPPORTED");
  }
  const texts = message.parts.map((part) => part.text).filter((text): text is string => typeof text === "string" && Boolean(text.trim()));
  const data = message.parts.map((part) => part.data).filter((part) => part !== undefined);
  if (texts.length === 0 && data.length === 0) throw new A2AValidationError("At least one text or data part is required");
  const metadataUserId = typeof message.metadata?.userId === "string" ? message.metadata.userId : undefined;
  try {
    return {
      agentAlias: selectedAgent(message),
      request: parseAgentRequest({
      requestId: message.messageId.trim(),
      userId: resolveActingUserId(principal, metadataUserId),
      ...(message.contextId ? { conversationId: message.contextId } : {}),
      task: texts.join("\n\n") || "Process the supplied structured A2A message",
      ...(data.length ? { input: { parts: data } } : {}),
      context: {
        protocol: "A2A",
        protocolVersion: "1.0",
        ...(message.metadata ? { messageMetadata: message.metadata } : {}),
      },
      }),
    };
  } catch (error) {
    if (error instanceof AgentRequestValidationError) throw new A2AValidationError(error.message);
    throw error;
  }
}

export function runToA2ATask(run: AgentRun): A2ATask {
  const config = loadDtaConfig();
  const contextId = run.agentMetadata?.conversationId ?? run.id;
  const timestamp = run.finishedAt ?? run.startedAt ?? run.createdAt;
  const state = agentRunStatusToA2ATaskState(run.status);
  const review = reviewForAgentRun(run);
  const actions = releasedActionsForAgentRun(run);
  const statusMessage = run.status === "waiting_for_input" ? {
    messageId: `${run.id}-input-required`,
    role: "ROLE_AGENT" as const,
    taskId: run.id,
    contextId,
    parts: [{ text: "The DTA Agent requires more information to continue." }],
  } : run.error ? {
    messageId: `${run.id}-error`,
    role: "ROLE_AGENT" as const,
    taskId: run.id,
    contextId,
    parts: [{ text: run.error }],
  } : undefined;
  return {
    id: run.id,
    contextId,
    status: { state, timestamp, ...(statusMessage ? { message: statusMessage } : {}) },
    ...(run.artifacts?.length ? { artifacts: run.artifacts.map((artifact) => artifactToA2A(artifact, config.publicBaseUrl)) } : {}),
    metadata: {
      requestId: run.requestId ?? run.id,
      agentId: run.agentMetadata?.agentId,
      ...(actions?.length ? { actions } : {}),
      ...(review ? { review } : {}),
    },
  };
}

export function eventToA2AStream(run: AgentRun, event: GenericAgentEvent): Record<string, unknown> {
  const contextId = run.agentMetadata?.conversationId ?? run.id;
  if (event.type === "artifact_created") {
    const artifact = run.artifacts?.find((candidate) => candidate.id === event.artifactId);
    if (artifact) return { artifactUpdate: { taskId: run.id, contextId, artifact: artifactToA2A(artifact, loadDtaConfig().publicBaseUrl) } };
  }
  const state: A2ATaskState = event.type === "completed" ? "TASK_STATE_COMPLETED"
    : event.type === "failed" ? "TASK_STATE_FAILED"
      : event.type === "waiting_for_input" ? "TASK_STATE_INPUT_REQUIRED"
        : "TASK_STATE_WORKING";
  return {
    statusUpdate: {
      taskId: run.id,
      contextId,
      status: {
        state,
        timestamp: new Date().toISOString(),
        ...((event.type === "waiting_for_input" || event.type === "failed") ? {
          message: {
            messageId: `${run.id}-${event.type}-${Date.now()}`,
            role: "ROLE_AGENT",
            taskId: run.id,
            contextId,
            parts: [{ text: event.type === "waiting_for_input" ? event.prompt : event.error }],
          },
        } : {}),
      },
    },
  };
}

export async function submitA2AMessage(value: unknown, principal: RequestPrincipal): Promise<AgentRun> {
  const parsed = parseA2ASendMessage(value, principal);
  const response = await getAgentContractService().submit(parsed.agentAlias, parsed.request);
  return getAgentContractService().getRun(response.runId);
}
