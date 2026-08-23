// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PMAgentDialog } from "../PMAgentDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PMAgentDialog", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.restoreAllMocks();
  });

  it("launches a PM conversation in the managed DTA workspace", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      workspace: { id: "dta-pm", displayName: "DTA PM Space", cwd: "/data/workspaces/pm" },
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    const onLaunch = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<PMAgentDialog onClose={vi.fn()} onLaunch={onLaunch} />));
    await act(async () => { await Promise.resolve(); });

    const requirement = [...container.querySelectorAll<HTMLTextAreaElement>("textarea")][0];
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(requirement, "Approved users need traceable meeting follow-up.");
      requirement.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const launch = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Generate PM artifacts"));
    await act(async () => launch?.click());

    expect(onLaunch).toHaveBeenCalledOnce();
    expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({
      cwd: "/data/workspaces/pm",
      prompt: expect.stringContaining("Approved users need traceable meeting follow-up."),
    }));
    expect(onLaunch.mock.calls[0]?.[0].prompt).toContain("publish_pm_result exactly once");
  });
});
