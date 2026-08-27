// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowActionsPanel } from "../WorkflowActionsPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkflowActionsPanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    vi.restoreAllMocks();
  });

  it("executes an available n8n workflow through the governed DTA endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return Response.json({
          replayed: false,
          execution: { id: "exec-1", workflowId: "meeting-notify-teams", status: "completed" },
        }, { status: 201 });
      }
      return Response.json({
        provider: "n8n",
        enabled: true,
        workflows: [{
          id: "meeting-notify-teams",
          displayName: "Notify the meeting team",
          description: "Send approved meeting outcomes.",
          provider: "n8n",
          configured: true,
          enabled: true,
          available: true,
          idempotencyKey: "meeting-1:notify:1",
        }],
        executions: [],
      });
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<WorkflowActionsPanel agentId="meeting-agent" sourceRunId="meeting-1" />));
    await act(async () => { await Promise.resolve(); });

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toContain("Run workflow");
    await act(async () => { button?.click(); await Promise.resolve(); });

    expect(fetchMock).toHaveBeenCalledWith("/api/workflows/meeting-notify-teams/execute", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "Idempotency-Key": "meeting-1:notify:1" }),
    }));
    expect(container.textContent).toContain("Workflow completed");
  });
});
