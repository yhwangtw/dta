import { describe, expect, it, vi } from "vitest";
import type { SessionInfo } from "@/lib/types";
import { resolveSessionForRestore } from "../session-restore";

const restoredSession: SessionInfo = {
  path: "/sessions/session-id.jsonl",
  id: "session-id",
  cwd: "/workspace/project",
  name: "Restored session",
  created: "2026-07-18T00:00:00.000Z",
  modified: "2026-07-18T00:01:00.000Z",
  messageCount: 2,
  firstMessage: "hello",
};

describe("resolveSessionForRestore", () => {
  it("falls back to the session detail endpoint when the first session list misses the URL target", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ info: restoredSession }),
    });

    await expect(resolveSessionForRestore("session-id", [], fetcher)).resolves.toEqual(restoredSession);
    expect(fetcher).toHaveBeenCalledWith("/api/sessions/session-id");
  });
});
