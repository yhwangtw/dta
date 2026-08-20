import { describe, expect, it } from "vitest";
import { createRuntimeProfile } from "../runtime/runtime-profile";

describe("agent runtime profiles", () => {
  it("keeps Coding Agent on the existing default runtime", () => {
    const profile = createRuntimeProfile({ agentType: "coding", agentId: "coding-agent", displayName: "Coding Agent" });
    expect(profile.systemPrompt).toBeUndefined();
    expect(profile.customTools).toBeUndefined();
  });

  it("gives Meeting Agent a bounded tool surface and dedicated prompt", () => {
    const profile = createRuntimeProfile({
      agentType: "meeting",
      agentId: "meeting-agent",
      displayName: "Meeting Agent",
      runId: "meeting-run-12345678",
    });
    expect(profile.systemPrompt).toContain("Meeting Intelligence specialist");
    expect(profile.activeToolNames).toEqual(["ask_user", "publish_meeting_result"]);
    expect(profile.customTools?.map((tool) => tool.name)).toEqual(["publish_meeting_result"]);
  });

  it("requires a run identity for structured Meeting results", () => {
    expect(() => createRuntimeProfile({ agentType: "meeting", agentId: "meeting-agent", displayName: "Meeting Agent" }))
      .toThrow("requires a runId");
  });
});
