// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionUIPanel } from "../ExtensionUIPanel";
import type { ExtensionUIState } from "@/hooks/use-extension-ui";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ExtensionUIPanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
  });

  async function render(state: ExtensionUIState, onRespond = vi.fn().mockResolvedValue(undefined)) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<ExtensionUIPanel state={state} onRespond={onRespond} />));
    return { onRespond };
  }

  it("submits a selected extension option", async () => {
    const state: ExtensionUIState = {
      dialogs: [{
        type: "extension_ui_request",
        id: "select-1",
        method: "select",
        title: "Deploy target",
        options: ["Staging", "Production"],
      }],
      statuses: {},
      widgets: {},
    };
    const { onRespond } = await render(state);

    const production = container!.querySelector<HTMLButtonElement>('[data-value="Production"]')!;
    await act(async () => production.click());
    const submit = container!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(false);
    await act(async () => submit.click());

    expect(onRespond).toHaveBeenCalledWith({
      type: "extension_ui_response",
      id: "select-1",
      value: "Production",
    });
  });

  it("collects structured ask_user answers and renders extension chrome", async () => {
    const state: ExtensionUIState = {
      dialogs: [{
        type: "extension_ui_request",
        id: "ask-1",
        method: "ask_user",
        questions: [
          {
            id: "target",
            header: "Deploy",
            question: "Where should this release go?",
            options: [
              { label: "Staging", description: "Validate safely" },
              { label: "Production", description: "Release to users" },
            ],
            allowOther: false,
          },
          {
            id: "note",
            header: "Context",
            question: "Any release note?",
            options: [],
            allowOther: true,
          },
        ],
      }],
      statuses: { review: "Waiting for approval" },
      widgets: { checks: { lines: ["2 checks remaining"], placement: "aboveEditor" } },
    };
    const { onRespond } = await render(state);

    expect(container!.textContent).toContain("Waiting for approval");
    expect(container!.textContent).toContain("2 checks remaining");
    await act(async () => container!.querySelector<HTMLButtonElement>(
      '[data-question-id="target"][data-value="Production"]',
    )!.click());
    const note = container!.querySelector<HTMLInputElement>('[data-question-id="note"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(note, "Roll out after smoke tests");
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());

    expect(onRespond).toHaveBeenCalledWith({
      type: "extension_ui_response",
      id: "ask-1",
      answers: { target: "Production", note: "Roll out after smoke tests" },
    });
  });
});
