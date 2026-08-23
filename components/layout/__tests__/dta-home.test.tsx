// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DtaHome } from "../DtaHome";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DtaHome", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("presents department capabilities without claiming planned agents are complete", async () => {
    const handlers = {
      onOpenAgents: vi.fn(),
      onOpenMeetingAgent: vi.fn(),
      onOpenPMAgent: vi.fn(),
      departmentAgents: [{ id: "knowledge-agent", agentType: "department" as const, displayName: "Knowledge Agent", description: "Creates governed knowledge briefs." }],
      onOpenDepartmentAgent: vi.fn(),
      onOpenReviews: vi.fn(),
      onOpenKnowledge: vi.fn(),
      onStartConversation: vi.fn().mockResolvedValue(undefined),
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(
      <DtaHome attentionCount={4} {...handlers} />,
    ));

    expect(container.querySelector('[data-testid="dta-home"]')).not.toBeNull();
    expect(container.textContent).toContain("Turn every meeting into decisions and accountable action.");
    expect(container.textContent).toContain("From conversation to action");
    expect(container.textContent).toContain("Talk to Meeting Agent");
    expect(container.textContent).toContain("Human-reviewed by default");
    expect(container.textContent).toContain("New meeting");
    expect(container.textContent).toContain("PM Agent");
    expect(container.textContent).toContain("Start PM analysis");
    expect(container.textContent).toContain("Knowledge Agent");
    expect(container.textContent).not.toContain("Choose a department workspace");

    const button = (label: string) => [...container!.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.includes(label));
    await act(async () => button("Create meeting minutes")?.click());
    await act(async () => button("Start PM analysis")?.click());
    await act(async () => button("Meeting knowledge")?.click());
    await act(async () => button("Knowledge Agent")?.click());

    const composer = container.querySelector<HTMLTextAreaElement>("#dta-meeting-message");
    await act(async () => {
      if (!composer) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(composer, "Help me prepare the weekly meeting");
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Start conversation")?.click());

    expect(handlers.onOpenMeetingAgent).toHaveBeenCalledOnce();
    expect(handlers.onOpenAgents).not.toHaveBeenCalled();
    expect(handlers.onOpenPMAgent).toHaveBeenCalledOnce();
    expect(handlers.onOpenKnowledge).toHaveBeenCalledOnce();
    expect(handlers.onOpenDepartmentAgent).toHaveBeenCalledWith(handlers.departmentAgents[0]);
    expect(handlers.onStartConversation).toHaveBeenCalledWith("Help me prepare the weekly meeting");
  });
});
