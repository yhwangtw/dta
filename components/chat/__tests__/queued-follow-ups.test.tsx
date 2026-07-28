// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueuedFollowUps } from "../QueuedFollowUps";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("QueuedFollowUps", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  async function render() {
    const handlers = {
      onRemove: vi.fn().mockResolvedValue(true),
      onUpdate: vi.fn().mockResolvedValue(true),
      onMove: vi.fn().mockResolvedValue(true),
      onClear: vi.fn().mockResolvedValue(true),
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <QueuedFollowUps
        items={[
          { id: "a", message: "Run focused tests" },
          { id: "b", message: "Review the diff", images: [{ data: "x", mimeType: "image/png" }] },
        ]}
        busy={false}
        {...handlers}
      />,
    ));
    return handlers;
  }

  it("exposes ordering, editing, removal, and attachment state", async () => {
    const handlers = await render();
    expect(container!.textContent).toContain("Queued follow-ups");
    expect(container!.textContent).toContain("1 images");

    const moveLater = container!.querySelector<HTMLButtonElement>('button[aria-label="Move later"]')!;
    await act(async () => moveLater.click());
    expect(handlers.onMove).toHaveBeenCalledWith("a", 1);

    const edit = [...container!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Run focused tests"))!;
    await act(async () => edit.click());
    const textarea = container!.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "Run all tests");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...container!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Save")!;
    await act(async () => save.click());
    expect(handlers.onUpdate).toHaveBeenCalledWith("a", "Run all tests");

    const removeButtons = container!.querySelectorAll<HTMLButtonElement>('button[aria-label="Remove queued follow-up"]');
    await act(async () => removeButtons[1].click());
    expect(handlers.onRemove).toHaveBeenCalledWith("b");
  });
});
