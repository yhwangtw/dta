import { describe, expect, it } from "vitest";
import type { AssistantMessage } from "@/lib/types";
import { assistantModelKey, shouldShowAssistantModelLabel } from "../message-chrome";

const message = (model: string, stopReason?: AssistantMessage["stopReason"]): AssistantMessage => ({
  role: "assistant",
  provider: "provider",
  model,
  content: [{ type: "text", text: "answer" }],
  stopReason,
});

describe("assistant message chrome", () => {
  it("shows a model label only at the first answer, on a model change, or on an error", () => {
    const first = message("alpha");
    expect(shouldShowAssistantModelLabel(null, first)).toBe(true);
    expect(shouldShowAssistantModelLabel(assistantModelKey(first), message("alpha"))).toBe(false);
    expect(shouldShowAssistantModelLabel(assistantModelKey(first), message("beta"))).toBe(true);
    expect(shouldShowAssistantModelLabel(assistantModelKey(first), message("alpha", "error"))).toBe(true);
  });
});
