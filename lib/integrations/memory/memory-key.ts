import type { AgentMetadata } from "@/lib/agents/agent-types";

export function conversationMemoryKey(metadata: Pick<AgentMetadata, "userId" | "projectId" | "conversationId">): string | null {
  return metadata.conversationId
    ? [metadata.userId ?? "anonymous", metadata.projectId ?? "default", metadata.conversationId].join(":")
    : null;
}
