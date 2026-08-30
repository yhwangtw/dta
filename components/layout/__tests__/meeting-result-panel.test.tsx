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
        reviewStatus: "needs_review",
        revision: 1,
        reviewHistory: [],
        actions: [{ type: "handoff", target: "pm-agent", reason: "Product requirement found" }],
        updatedAt: "2026-08-19T00:00:00.000Z",
        result: {
          schemaVersion: "2.0",
          title: "Weekly sync",
          summary: "Pilot approved.",
          decisions: [{ id: "decision_pilot", text: "Approve pilot", owner: "Elon", evidence: [{ timestamp: "00:12:30", excerpt: "Pilot approved." }], confidence: 0.94, needsConfirmation: false }],
          actionItems: [{ id: "action_launch", title: "Launch pilot", owner: "Alex", evidence: [], confidence: 0.4, needsConfirmation: true }],
          requirements: [{ id: "requirement_audit", title: "Audit log", description: "Keep evidence.", evidence: [], confidence: 0.4, needsConfirmation: true }],
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
    expect(container.textContent).toContain("Source confidence 94%");
    expect(container.textContent).toContain("Evidence · 1");
    expect(container.textContent).toContain("Needs confirmation");
    expect(container.querySelector('a[href="/api/artifacts/a1"]')).not.toBeNull();
    expect(container.textContent).toContain("Waiting for approval");
    expect(container.textContent).toContain("PM Agent");
    expect(container.textContent).toContain("Awaiting approval");
  });

  it("approves a review-ready result through the human control plane", async () => {
    const result = {
      title: "Review sync",
      summary: "Review the pilot evidence.",
      decisions: [],
      actionItems: [],
      requirements: [],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const approved = init?.method === "POST";
      return new Response(JSON.stringify({
        ...(approved ? {} : { metadata: { agentType: "meeting", agentId: "meeting-agent", displayName: "Meeting Agent", runId: "run-review" } }),
        meetingRun: {
          runId: "run-review",
          status: "completed",
          reviewStatus: approved ? "approved" : "needs_review",
          revision: 1,
          reviewHistory: approved ? [{ status: "approved", actorId: "local-user", reviewedAt: "2026-08-19T01:00:00.000Z", revision: 1 }] : [],
          actions: [],
          updatedAt: "2026-08-19T01:00:00.000Z",
          result,
          artifacts: [],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<MeetingResultPanel sessionId="session-review" />));
    await act(async () => { await Promise.resolve(); });

    const approve = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Approve result"));
    expect(approve).toBeDefined();
    await act(async () => { approve?.click(); await Promise.resolve(); });

    expect(fetchMock).toHaveBeenCalledWith("/api/meeting-agent/runs/run-review/review", expect.objectContaining({ method: "POST" }));
    expect(container.textContent).toContain("Approved");
  });
});
