import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import { MEETING_AGENT_SYSTEM_PROMPT } from "@/lib/agents/meeting/meeting-prompt";
import { createPublishMeetingResultTool, PUBLISH_MEETING_RESULT_TOOL_NAME } from "@/lib/agents/meeting/meeting-publish-tool";
import { ASK_USER_TOOL_NAME } from "@/lib/web-extension-ui";

export interface AgentRuntimeProfile {
  metadata: AgentMetadata;
  systemPrompt?: string;
  customTools?: ToolDefinition[];
  activeToolNames?: string[];
}

export function createRuntimeProfile(metadata: AgentMetadata): AgentRuntimeProfile {
  if (metadata.agentType !== "meeting") return { metadata };
  if (!metadata.runId) throw new Error("Meeting Agent requires a runId");
  return {
    metadata,
    systemPrompt: MEETING_AGENT_SYSTEM_PROMPT,
    customTools: [createPublishMeetingResultTool(metadata.runId)],
    activeToolNames: [ASK_USER_TOOL_NAME, PUBLISH_MEETING_RESULT_TOOL_NAME],
  };
}
