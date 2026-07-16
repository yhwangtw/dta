import { describe, expect, it, vi } from "vitest";
import { AgentSessionWrapper } from "../rpc-manager";
import type { AgentSessionLike } from "../pi-types";

describe("AgentSessionWrapper compact command", () => {
  it("delegates repeated-compaction eligibility to Pi", async () => {
    const compactResult = {
      summary: "updated summary",
      firstKeptEntryId: "kept-2",
      tokensBefore: 42_000,
      estimatedTokensAfter: 12_000,
    };
    const compact = vi.fn().mockResolvedValue(compactResult);
    const inner = {
      sessionId: "session-1",
      sessionFile: "/tmp/session-1.jsonl",
      sessionManager: {
        // The old web pre-check rejects this shape before Pi gets a chance to
        // apply its firstKeptEntryId-aware repeated-compaction logic.
        getBranch: () => [
          {
            type: "compaction",
            id: "compact-1",
            firstKeptEntryId: "kept-1",
          },
          { type: "message", id: "new-user", message: { role: "user", content: "continue" } },
        ],
      },
      settingsManager: {
        getCompactionSettings: () => ({ enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 }),
      },
      compact,
      dispose: vi.fn(),
    } as unknown as AgentSessionLike;
    const wrapper = new AgentSessionWrapper(inner);

    try {
      await expect(wrapper.send({ type: "compact", customInstructions: "focus on decisions" }))
        .resolves.toEqual(compactResult);
      expect(compact).toHaveBeenCalledWith("focus on decisions");
    } finally {
      wrapper.destroy();
    }
  });
});
