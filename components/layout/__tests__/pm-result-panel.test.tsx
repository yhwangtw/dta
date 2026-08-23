// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PMResultPanel } from "../PMResultPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PMResultPanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.restoreAllMocks();
  });

  it("renders PM artifacts and framework-neutral recommended actions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      metadata: { agentType: "pm", agentId: "pm-agent", displayName: "PM Agent", runId: "pm-run-1" },
      pmRun: {
        runId: "pm-run-1",
        status: "completed",
        result: {
          requirementSummary: "Automate approved meeting follow-up.",
          artifacts: [
            { type: "URD", artifactId: "artifact-urd", title: "Meeting follow-up URD" },
            { type: "PRD", artifactId: "artifact-prd", title: "Meeting follow-up PRD" },
          ],
        },
        artifacts: [],
        actions: [{ type: "workflow", target: "pm-create-jira-epic", reason: "Delivery can begin after approval." }],
        updatedAt: "2026-08-23T00:00:00.000Z",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<PMResultPanel sessionId="session-pm" />));
    await act(async () => { await Promise.resolve(); });

    expect(container.querySelector('[data-testid="pm-result-panel"]')).not.toBeNull();
    expect(container.textContent).toContain("Automate approved meeting follow-up.");
    expect(container.textContent).toContain("Meeting follow-up URD");
    expect(container.textContent).toContain("pm-create-jira-epic");
    expect(container.querySelector('a[href="/api/artifacts/artifact-urd"]')).not.toBeNull();
  });
});
