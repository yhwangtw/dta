// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttentionPanel } from "../AttentionPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AttentionPanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    vi.restoreAllMocks();
  });

  it("presents meeting review items without exposing filesystem paths or raw runtime errors", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <AttentionPanel
        items={[{
          id: "meeting:run-1:failed",
          source: "meeting",
          severity: "warning",
          status: "failed",
          title: "Meeting result needs review",
          summary: "The Meeting Agent finished without publishing a structured result",
          occurredAt: "2026-08-20T00:00:00.000Z",
          cwd: "/Users/example/legacy-repository",
          sessionId: "session-1",
        }]}
        readIds={new Set()}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenSource={vi.fn()}
      />,
    ));

    expect(container.textContent).toContain("Review queue");
    expect(container.textContent).toContain("Meeting result needs review");
    expect(container.textContent).toContain("Continue the conversation");
    expect(container.textContent).not.toContain("/Users/example");
    expect(container.textContent).not.toContain("finished without publishing");
  });
});
