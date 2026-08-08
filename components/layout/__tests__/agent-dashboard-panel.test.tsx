// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentDashboardPanel } from "../AgentDashboardPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AgentDashboardPanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
  });

  it("AC-4.4: adjusts the persisted concurrent agent slots from 1 through 8", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return json({ maxConcurrency: 5 });
      }
      return json({
        runs: [],
        counts: {},
        maxConcurrency: 3,
        serverTime: "2026-07-26T06:00:00.000Z",
        nextCursor: null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<AgentDashboardPanel defaultCwd="/tmp/project" onOpenSession={vi.fn()} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Concurrent agent slots"]',
    );
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain("3");

    await act(async () => {
      trigger!.click();
    });
    const options = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(options.map((option) => option.textContent?.replace("✓", ""))).toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "8"],
    );

    await act(async () => {
      options[4]!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/agent-runs", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ maxConcurrency: 5 }),
    }));
    expect(trigger!.textContent).toContain("5");
  });
});
