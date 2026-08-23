import type { GenericAgentEvent } from "@/lib/agents/agent-types";
import type { AgentEvent } from "@/lib/rpc-manager";
import type { WebExtensionUIEvent } from "@/lib/web-extension-ui";

type RuntimeEvent = AgentEvent | WebExtensionUIEvent;

function recordOf(event: RuntimeEvent): Record<string, unknown> {
  return event as unknown as Record<string, unknown>;
}

function toolName(event: RuntimeEvent): string | null {
  const record = recordOf(event);
  for (const key of ["toolName", "tool", "name"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return null;
}

function waitingPrompt(event: RuntimeEvent): string {
  const record = recordOf(event);
  if (record.method === "ask_user" && Array.isArray(record.questions)) {
    const questions = record.questions.flatMap((question) => {
      if (!question || typeof question !== "object") return [];
      const text = (question as Record<string, unknown>).question;
      return typeof text === "string" && text.trim() ? [text.trim()] : [];
    });
    if (questions.length) return questions.join("\n");
  }
  for (const key of ["message", "title", "placeholder"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return "User input required";
}

function agentEndError(record: Record<string, unknown>): string | null {
  if (!Array.isArray(record.messages)) return null;
  for (let index = record.messages.length - 1; index >= 0; index--) {
    const message = record.messages[index];
    if (!message || typeof message !== "object") continue;
    const candidate = message as Record<string, unknown>;
    if (candidate.role !== "assistant") continue;
    if (candidate.stopReason === "error") {
      return typeof candidate.errorMessage === "string" && candidate.errorMessage
        ? candidate.errorMessage
        : "Model call failed";
    }
    if (candidate.stopReason === "aborted") return "The agent run was aborted";
    return null;
  }
  return null;
}

export function normalizePiAgentEvent(event: RuntimeEvent, runId: string): GenericAgentEvent | null {
  const record = recordOf(event);
  if (event.type === "agent_start") return { type: "run_started", runId };
  if (event.type === "tool_execution_start" || event.type === "tool_start") {
    const tool = toolName(event);
    return tool ? { type: "tool_started", tool } : null;
  }
  if (event.type === "tool_execution_end" || event.type === "tool_end") {
    const tool = toolName(event);
    // Raw Pi tool payloads may contain runtime-specific content blocks or
    // internal paths. Public consumers get the normalized completion signal;
    // durable domain output is exposed separately as artifacts/results.
    return tool ? { type: "tool_completed", tool } : null;
  }
  if (event.type === "agent_end") {
    const error = agentEndError(record);
    return error
      ? { type: "failed", error }
      : { type: "completed", result: record.messages ?? null };
  }
  if (event.type === "extension_ui_request"
    && ["ask_user", "select", "confirm", "input", "editor"].includes(String(record.method))) {
    return { type: "waiting_for_input", prompt: waitingPrompt(event) };
  }
  if (event.type === "extension_ui_closed") {
    return { type: "status", state: "running", message: "User input received" };
  }
  if (event.type === "extension_ui_request" && record.method === "setStatus" && typeof record.statusText === "string") {
    return { type: "status", message: record.statusText };
  }
  if (event.type === "session_runtime_failed") {
    return { type: "failed", error: typeof record.message === "string" ? record.message : "Agent runtime failed" };
  }
  return null;
}
