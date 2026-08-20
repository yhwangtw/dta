// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingResultPanel } from "../MeetingResultPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MeetingResultPanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    vi.restoreAllMocks();
  });

  it("renders structured decisions, actions, requirements, and artifacts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      metadata: { agentType: "meeting", agentId: "meeting-agent", displayName: "Meeting Agent", runId: "run-1" },
      meetingRun: {
        runId: "run-1",
        status: "completed",
        updatedAt: "2026-08-19T00:00:00.000Z",
        result: {
          title: "Weekly sync",
          summary: "Pilot approved.",
          decisions: [{ text: "Approve pilot", owner: "Elon" }],
          actionItems: [{ title: "Launch pilot", owner: "Alex" }],
          requirements: [{ title: "Audit log", description: "Keep evidence." }],
        },
        artifacts: [{ id: "a1", type: "meeting_minutes", title: "Minutes", mimeType: "text/markdown", size: 10, createdAt: "2026-08-19T00:00:00.000Z" }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<MeetingResultPanel sessionId="session-1" />));
    await act(async () => { await Promise.resolve(); });

    expect(container.textContent).toContain("Weekly sync");
    expect(container.textContent).toContain("Approve pilot");
    expect(container.textContent).toContain("Launch pilot");
    expect(container.textContent).toContain("Audit log");
    expect(container.querySelector('a[href="/api/artifacts/a1"]')).not.toBeNull();
  });
});
