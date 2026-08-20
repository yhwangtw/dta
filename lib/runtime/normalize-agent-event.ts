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

export function normalizePiAgentEvent(event: RuntimeEvent, runId: string): GenericAgentEvent | null {
  const record = recordOf(event);
  if (event.type === "agent_start") return { type: "run_started", runId };
  if (event.type === "tool_execution_start" || event.type === "tool_start") {
    const tool = toolName(event);
    return tool ? { type: "tool_started", tool } : null;
  }
  if (event.type === "tool_execution_end" || event.type === "tool_end") {
    const tool = toolName(event);
    return tool ? { type: "tool_completed", tool, ...(record.result !== undefined ? { result: record.result } : {}) } : null;
  }
  if (event.type === "agent_end") return { type: "completed", result: record.messages ?? null };
  if (event.type === "extension_ui_request" && record.method === "ask_user") {
    return { type: "waiting_for_input", prompt: "User input required" };
  }
  if (event.type === "session_runtime_failed") {
    return { type: "failed", error: typeof record.message === "string" ? record.message : "Agent runtime failed" };
  }
  return null;
}
