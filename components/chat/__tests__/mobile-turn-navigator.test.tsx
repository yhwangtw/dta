// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
import { MobileTurnNavigator } from "../MobileTurnNavigator";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MobileTurnNavigator", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => setLocale("en"));
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("opens a turn sheet and can filter to bookmarked turns", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const scroll = document.createElement("div");
    scroll.getBoundingClientRect = vi.fn(() => ({ top: 0, bottom: 600 } as DOMRect));
    const refs = [document.createElement("div"), document.createElement("div")];
    refs[0].getBoundingClientRect = vi.fn(() => ({ top: -20 } as DOMRect));
    refs[1].getBoundingClientRect = vi.fn(() => ({ top: 300 } as DOMRect));

    await act(async () => root?.render(
      <MobileTurnNavigator
        turns={[
          { entryId: "1", visibleIndex: 0, preview: "First prompt", bookmarked: false },
          { entryId: "2", visibleIndex: 1, preview: "Bookmarked prompt", bookmarked: true },
        ]}
        scrollContainer={{ current: scroll }}
        messageRefs={{ current: refs }}
      />,
    ));

    await act(async () => container!.querySelector<HTMLButtonElement>('button[aria-label="Turns"]')!.click());
    expect(container!.textContent).toContain("First prompt");
    expect(container!.textContent).toContain("Bookmarked prompt");

    const bookmarks = [...container!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Bookmarks"))!;
    await act(async () => bookmarks.click());
    expect(container!.textContent).not.toContain("First prompt");
    expect(container!.textContent).toContain("Bookmarked prompt");
  });
});
