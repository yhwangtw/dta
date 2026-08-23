import { describe, expect, it } from "vitest";
import { codingAgentMetadata, isAgentMetadata } from "../agents/agent-types";
import { normalizePiAgentEvent } from "../runtime/normalize-agent-event";

describe("generic agent contract", () => {
  it("validates stable agent identity without exposing Pi details", () => {
    expect(isAgentMetadata({
      agentType: "meeting",
      agentId: "meeting-agent",
      displayName: "Meeting Agent",
      runId: "run-12345678",
    })).toBe(true);
    expect(isAgentMetadata({ agentType: "unknown", agentId: "x", displayName: "X" })).toBe(false);
    expect(codingAgentMetadata()).toMatchObject({ agentType: "coding", agentId: "coding-agent" });
  });

  it("normalizes supported Pi events and ignores implementation-only events", () => {
    expect(normalizePiAgentEvent({ type: "agent_start" }, "run-1")).toEqual({ type: "run_started", runId: "run-1" });
    expect(normalizePiAgentEvent({ type: "tool_execution_start", toolName: "publish_meeting_result" }, "run-1"))
      .toEqual({ type: "tool_started", tool: "publish_meeting_result" });
    expect(normalizePiAgentEvent({ type: "model_change" }, "run-1")).toBeNull();
  });

  it("normalizes human input and terminal outcomes without leaking Pi event shapes", () => {
    expect(normalizePiAgentEvent({
      type: "extension_ui_request",
      id: "question-1",
      method: "ask_user",
      questions: [{
        id: "scope",
        question: "Which project should own this action?",
        options: [],
        allowOther: true,
      }],
    }, "run-1")).toEqual({
      type: "waiting_for_input",
      prompt: "Which project should own this action?",
    });
    expect(normalizePiAgentEvent({
      type: "extension_ui_closed",
      id: "question-1",
      reason: "answered",
    }, "run-1")).toEqual({
      type: "status",
      state: "running",
      message: "User input received",
    });
    expect(normalizePiAgentEvent({
      type: "agent_end",
      messages: [{ role: "assistant", stopReason: "error", errorMessage: "Provider unavailable" }],
    }, "run-1")).toEqual({ type: "failed", error: "Provider unavailable" });
  });
});
