// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingLibraryPanel } from "../MeetingLibraryPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MeetingLibraryPanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    vi.restoreAllMocks();
  });

  it("lists meetings without exposing filesystem paths", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      runs: [{
        runId: "meeting-run-1",
        sessionId: "session-1",
        status: "completed",
        updatedAt: "2026-08-20T09:00:00.000Z",
        artifacts: [],
        result: { title: "Transformation sync", summary: "Pilot approved.", decisions: [], actionItems: [], requirements: [] },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const onOpenSession = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<MeetingLibraryPanel onNewMeeting={vi.fn()} onOpenSession={onOpenSession} />));
    await act(async () => { await Promise.resolve(); });

    expect(container.textContent).toContain("Transformation sync");
    expect(container.textContent).toContain("Pilot approved");
    expect(container.textContent).not.toContain("/Users/");
    const meetingButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Transformation sync"));
    await act(async () => meetingButton?.click());
    expect(onOpenSession).toHaveBeenCalledWith("session-1");
  });
});
