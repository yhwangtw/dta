// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingProcessingPanel } from "../MeetingProcessingPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MeetingProcessingPanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("separates active work, completed results, and issues", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      runs: [
        {
          runId: "run-active",
          sessionId: "session-active",
          status: "running",
          updatedAt: "2026-08-20T09:00:00.000Z",
          artifacts: [],
        },
        {
          runId: "run-ready",
          sessionId: "session-ready",
          status: "completed",
          updatedAt: "2026-08-20T08:00:00.000Z",
          artifacts: [],
          result: {
            title: "Transformation sync",
            summary: "The pilot was approved.",
            decisions: [],
            actionItems: [],
            requirements: [],
          },
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const onOpenSession = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(
      <MeetingProcessingPanel onNewMeeting={vi.fn()} onOpenSession={onOpenSession} />,
    ));
    await act(async () => { await Promise.resolve(); });

    expect(container.querySelector('[data-testid="meeting-processing"]')).not.toBeNull();
    expect(container.textContent).toContain("Processing activity");
    expect(container.textContent).toContain("Processing evidence");
    expect(container.textContent).toContain("Minutes ready");
    expect(container.textContent).toContain("Transformation sync");

    const viewResult = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("View result"));
    await act(async () => viewResult?.click());
    expect(onOpenSession).toHaveBeenCalledWith("session-ready");
  });
});
