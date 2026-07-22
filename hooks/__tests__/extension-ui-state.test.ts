import { describe, expect, it } from "vitest";
import { extensionUIReducer, initialExtensionUIState } from "../use-extension-ui";

describe("extensionUIReducer", () => {
  it("queues dialog requests once and removes them when closed", () => {
    const request = {
      type: "extension_ui_request" as const,
      id: "question-1",
      method: "select" as const,
      title: "Choose",
      options: ["A", "B"],
    };
    const queued = extensionUIReducer(initialExtensionUIState, { type: "event", event: request });
    const deduped = extensionUIReducer(queued, { type: "event", event: request });
    expect(deduped.dialogs).toEqual([request]);

    const closed = extensionUIReducer(deduped, {
      type: "event",
      event: { type: "extension_ui_closed", id: "question-1", reason: "answered" },
    });
    expect(closed.dialogs).toEqual([]);
  });

  it("keeps status and widget state by extension key", () => {
    const withStatus = extensionUIReducer(initialExtensionUIState, {
      type: "event",
      event: {
        type: "extension_ui_request",
        id: "status-1",
        method: "setStatus",
        statusKey: "review",
        statusText: "Waiting",
      },
    });
    const withWidget = extensionUIReducer(withStatus, {
      type: "event",
      event: {
        type: "extension_ui_request",
        id: "widget-1",
        method: "setWidget",
        widgetKey: "review",
        widgetLines: ["2 checks remaining"],
        widgetPlacement: "aboveEditor",
      },
    });
    expect(withWidget.statuses).toEqual({ review: "Waiting" });
    expect(withWidget.widgets).toEqual({
      review: { lines: ["2 checks remaining"], placement: "aboveEditor" },
    });

    const cleared = extensionUIReducer(withWidget, {
      type: "event",
      event: {
        type: "extension_ui_request",
        id: "status-2",
        method: "setStatus",
        statusKey: "review",
        statusText: undefined,
      },
    });
    expect(cleared.statuses).toEqual({});
  });

  it("clears stale state before an SSE reconnect snapshot is replayed", () => {
    const stale = {
      dialogs: [],
      statuses: { old: "stale" },
      widgets: { old: { lines: ["stale"], placement: "aboveEditor" as const } },
    };
    expect(extensionUIReducer(stale, { type: "reset" })).toEqual(initialExtensionUIState);
  });
});
