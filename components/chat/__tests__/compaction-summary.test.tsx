// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentMessage } from "@/lib/types";
import { CompactionSummary, getCompactionSummary } from "../CompactionSummary";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CompactionSummary", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("recognizes Pi's synthetic summary and keeps its details collapsed by default", async () => {
    const message: AgentMessage = {
      role: "user",
      content: "*The conversation history before this point was compacted into the following summary:*\n\nImportant earlier context",
    };
    const summary = getCompactionSummary(message);
    expect(summary).toBe("Important earlier context");

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<CompactionSummary summary={summary!} />));

    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("Earlier context summary");
  });
});
