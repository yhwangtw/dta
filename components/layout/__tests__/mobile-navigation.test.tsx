// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileNavigation } from "../MobileNavigation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MobileNavigation", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  async function renderNavigation() {
    const handlers = {
      onShowHome: vi.fn(),
      onShowChat: vi.fn(),
      onSelectView: vi.fn(),
      onOpenAppearance: vi.fn(),
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <MobileNavigation
        panelView="sessions"
        homeActive={false}
        panelOpen
        filePanelOpen={false}
        attentionUnreadCount={3}
        {...handlers}
      />,
    ));
    return handlers;
  }

  it("switches between chat, primary panels, and secondary tools", async () => {
    const handlers = await renderNavigation();
    const button = (label: string) => [...container!.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim().endsWith(label))!;

    await act(async () => button("Home").click());
    expect(handlers.onShowHome).toHaveBeenCalledOnce();

    await act(async () => button("Meeting").click());
    expect(handlers.onShowChat).toHaveBeenCalledOnce();

    await act(async () => button("Processing").click());
    expect(handlers.onSelectView).toHaveBeenCalledWith("agents");

    await act(async () => button("Review").click());
    expect(handlers.onSelectView).toHaveBeenCalledWith("attention");

    const chat = button("Meeting");
    const more = button("More");
    await act(async () => more.click());
    expect(container!.querySelector('section[aria-label="More"]')).not.toBeNull();
    expect(chat.getAttribute("aria-current")).toBeNull();
    expect(more.getAttribute("aria-current")).toBe("page");
    expect(container!.textContent).toContain("Work");
    expect(container!.textContent).toContain("Settings");

    await act(async () => button("Knowledge").click());
    expect(handlers.onSelectView).toHaveBeenCalledWith("knowledge");
    expect(container!.querySelector('section[aria-label="More"]')).toBeNull();
  });
});
