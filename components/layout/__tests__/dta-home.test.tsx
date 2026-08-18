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
      onOpenReviews: vi.fn(),
      onOpenSessions: vi.fn(),
      onOpenWorkflows: vi.fn(),
      onOpenKnowledge: vi.fn(),
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(
      <DtaHome attentionCount={4} hasWorkspace={false} {...handlers} />,
    ));

    expect(container.querySelector('[data-testid="dta-home"]')).not.toBeNull();
    expect(container.textContent).toContain("Move digital transformation from intent to impact.");
    expect(container.textContent).toContain("The transformation loop");
    expect(container.textContent).toContain("For teams and company orchestrators");
    expect(container.textContent).toContain("Meeting Intelligence");
    expect(container.textContent).toContain("PDLC Agent");
    expect(container.textContent).toContain("Available · Beta");
    expect(container.textContent).toContain("Planned");
    expect(container.textContent).toContain("Choose a department workspace");

    const button = (label: string) => [...container!.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.includes(label));
    await act(async () => button("Start with meeting intelligence")?.click());
    await act(async () => button("PDLC Agent")?.click());
    await act(async () => button("Department Knowledge")?.click());

    expect(handlers.onOpenMeetingAgent).toHaveBeenCalledOnce();
    expect(handlers.onOpenAgents).not.toHaveBeenCalled();
    expect(handlers.onOpenWorkflows).toHaveBeenCalledOnce();
    expect(handlers.onOpenKnowledge).toHaveBeenCalledOnce();
  });
});
