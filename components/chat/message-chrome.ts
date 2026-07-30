import type { AssistantMessage } from "@/lib/types";

export function assistantModelKey(message: { provider?: string; model?: string }): string {
  return `${message.provider ?? ""}:${message.model ?? ""}`;
}

export function shouldShowAssistantModelLabel(previousKey: string | null, message: AssistantMessage): boolean {
  return previousKey === null
    || previousKey !== assistantModelKey(message)
    || message.stopReason === "error";
}
