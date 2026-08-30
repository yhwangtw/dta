// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DepartmentResultPanel } from "../DepartmentResultPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DepartmentResultPanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    vi.restoreAllMocks();
  });

  it("renders manifest output, review state, artifacts, and governed actions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      metadata: { agentType: "department", agentId: "knowledge-agent", displayName: "Knowledge Agent", runId: "knowledge-run-1" },
      departmentRun: {
        runId: "knowledge-run-1",
        agentId: "knowledge-agent",
        status: "completed",
        result: { brief: "Pilot knowledge", sources: ["meeting-1"] },
        artifacts: [{ id: "artifact-1", type: "department_document", title: "Pilot brief", mimeType: "text/markdown", size: 10, createdAt: "2026-08-30T00:00:00.000Z" }],
        actions: [{ type: "notification", target: "knowledge-owner", reason: "Ready after approval" }],
        reviewStatus: "needs_review",
        revision: 1,
        reviewHistory: [],
        updatedAt: "2026-08-30T00:00:00.000Z",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<DepartmentResultPanel sessionId="session-1" />));
    await act(async () => { await Promise.resolve(); });

    expect(container.querySelector('[data-testid="department-result-panel"]')).not.toBeNull();
    expect(container.textContent).toContain("Knowledge Agent");
    expect(container.textContent).toContain("Pilot knowledge");
    expect(container.textContent).toContain("Waiting for approval");
    expect(container.textContent).toContain("knowledge-owner");
    expect(container.querySelector('a[href="/api/artifacts/artifact-1"]')).not.toBeNull();
  });
});
