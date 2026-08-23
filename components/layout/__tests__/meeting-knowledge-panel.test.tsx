// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingKnowledgePanel } from "../MeetingKnowledgePanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MeetingKnowledgePanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    vi.restoreAllMocks();
  });

  it("searches completed meeting outcomes without mixing in failed runs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      runs: [
        {
          runId: "run-ready",
          sessionId: "session-ready",
          status: "completed",
          reviewStatus: "approved",
          revision: 1,
          reviewHistory: [{ status: "approved", actorId: "reviewer", reviewedAt: "2026-08-20T08:00:00.000Z", revision: 1 }],
          updatedAt: "2026-08-20T08:00:00.000Z",
          artifacts: [],
          result: {
            title: "Transformation sync",
            summary: "The pilot was approved.",
            decisions: [{ text: "Launch the pilot", owner: "Elon" }],
            actionItems: [{ title: "Prepare rollout", owner: "Mina" }],
            requirements: [{ title: "Audit trail", description: "Keep evidence references." }],
          },
        },
        {
          runId: "run-unapproved",
          sessionId: "session-unapproved",
          status: "completed",
          reviewStatus: "needs_review",
          revision: 1,
          reviewHistory: [],
          updatedAt: "2026-08-20T07:30:00.000Z",
          artifacts: [],
          result: {
            title: "Unapproved private draft",
            summary: "This must not be searchable yet.",
            decisions: [],
            actionItems: [],
            requirements: [],
          },
        },
        {
          runId: "run-failed",
          status: "failed",
          updatedAt: "2026-08-20T07:00:00.000Z",
          artifacts: [],
          error: "runtime detail that should not be knowledge",
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const onOpenSession = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<MeetingKnowledgePanel onOpenSession={onOpenSession} />));
    await act(async () => { await Promise.resolve(); });

    expect(container.querySelector('[data-testid="meeting-knowledge"]')).not.toBeNull();
    expect(container.textContent).toContain("Meeting knowledge");
    expect(container.textContent).toContain("Transformation sync");
    expect(container.textContent).not.toContain("Unapproved private draft");
    expect(container.textContent).not.toContain("runtime detail");

    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      search.value = "audit trail";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Transformation sync");

    const result = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Transformation sync"));
    await act(async () => result?.click());
    expect(onOpenSession).toHaveBeenCalledWith("session-ready");
  });
});
