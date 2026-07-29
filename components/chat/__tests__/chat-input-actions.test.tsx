// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInput } from "../ChatInput";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ChatInput actions", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ prompts: [] }) }));
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    vi.unstubAllGlobals();
    container?.remove();
    root = null;
    container = null;
  });

  async function render(props: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <ChatInput
        onSend={vi.fn().mockResolvedValue(true)}
        onAbort={vi.fn()}
        isStreaming={false}
        persistKey="test-session"
        {...props}
      />,
    ));
    return container.querySelector<HTMLTextAreaElement>("textarea")!;
  }

  async function fill(textarea: HTMLTextAreaElement, value: string) {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, value);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("keeps the draft on failure and clears it only after a successful retry", async () => {
    const onSend = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const textarea = await render({ onSend });
    await fill(textarea, "Keep this carefully written prompt");

    const send = [...container!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Send"))!;
    await act(async () => send.click());
    expect(textarea.value).toBe("Keep this carefully written prompt");

    await act(async () => send.click());
    expect(textarea.value).toBe("");
  });

  it("defaults Enter to follow-up and honors Option+Enter for steer", async () => {
    const onFollowUp = vi.fn().mockResolvedValue(true);
    const onSteer = vi.fn().mockResolvedValue(true);
    const textarea = await render({ isStreaming: true, onFollowUp, onSteer });

    await fill(textarea, "Queue this");
    await act(async () => textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onFollowUp).toHaveBeenCalledWith("Queue this", undefined);
    expect(onSteer).not.toHaveBeenCalled();

    await fill(textarea, "Interrupt now");
    await act(async () => textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true })));
    expect(onSteer).toHaveBeenCalledWith("Interrupt now", undefined);
  });

  it("renders completed file mentions as removable context chips", async () => {
    const textarea = await render({ cwd: "/project" });
    await fill(textarea, "Review @src/app.ts before release");
    expect(container!.textContent).toContain("src/app.ts");

    const remove = container!.querySelector<HTMLButtonElement>('button[aria-label="Remove context src/app.ts"]')!;
    await act(async () => remove.click());
    expect(textarea.value).toBe("Review before release");
  });

  it("sends a visible message quote with the typed follow-up", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const onClearQuote = vi.fn();
    const textarea = await render({
      onSend,
      onClearQuote,
      quote: { entryId: "entry-1", role: "assistant", text: "First line\nSecond line" },
    });
    await fill(textarea, "Explain this");
    const send = [...container!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Send"))!;
    await act(async () => send.click());

    expect(onSend).toHaveBeenCalledWith("> First line\n> Second line\n\nExplain this", undefined);
    expect(onClearQuote).toHaveBeenCalledOnce();
  });

});
