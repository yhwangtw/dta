// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  extractComposerMentions,
  removeComposerMention,
} from "../composer-context";
import {
  loadStreamingSendMode,
  resolveStreamingSendMode,
  saveStreamingSendMode,
} from "../composer-mode";
import {
  moveQueuedFollowUp,
  updateQueuedFollowUp,
  type QueuedFollowUp,
} from "../queued-follow-ups";

describe("composer context mentions", () => {
  it("extracts quoted and unquoted file mentions", () => {
    expect(extractComposerMentions('Review @src/app.ts and @"docs/my plan.md" please')).toEqual([
      { path: "src/app.ts", raw: "@src/app.ts", start: 7, end: 18 },
      { path: "docs/my plan.md", raw: '@"docs/my plan.md"', start: 23, end: 41 },
    ]);
  });

  it("ignores email addresses and incomplete quoted mentions", () => {
    expect(extractComposerMentions('mail a@b.com then open @"docs/plan')).toEqual([]);
  });

  it("removes one mention without gluing surrounding words together", () => {
    const value = "Review @src/app.ts before release";
    const [mention] = extractComposerMentions(value);
    expect(removeComposerMention(value, mention)).toBe("Review before release");
  });
});

describe("streaming send mode", () => {
  beforeEach(() => localStorage.clear());

  it("uses explicit keyboard modifiers and otherwise keeps the selected mode", () => {
    expect(resolveStreamingSendMode({ altKey: true, metaKey: false, ctrlKey: false }, "followup")).toBe("steer");
    expect(resolveStreamingSendMode({ altKey: false, metaKey: true, ctrlKey: false }, "steer")).toBe("followup");
    expect(resolveStreamingSendMode({ altKey: false, metaKey: false, ctrlKey: true }, "steer")).toBe("followup");
    expect(resolveStreamingSendMode({ altKey: false, metaKey: false, ctrlKey: false }, "steer")).toBe("steer");
  });

  it("persists the safer follow-up default and an explicit selection", () => {
    expect(loadStreamingSendMode()).toBe("followup");
    saveStreamingSendMode("steer");
    expect(loadStreamingSendMode()).toBe("steer");
  });
});

describe("queued follow-up editing", () => {
  const queued: QueuedFollowUp[] = [
    { id: "a", message: "first", images: [{ data: "one", mimeType: "image/png" }] },
    { id: "b", message: "second" },
    { id: "c", message: "third" },
  ];

  it("moves an item without dropping its image payload", () => {
    const moved = moveQueuedFollowUp(queued, "a", 1);
    expect(moved.map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(moved[1].images).toEqual([{ data: "one", mimeType: "image/png" }]);
  });

  it("updates only the selected message", () => {
    expect(updateQueuedFollowUp(queued, "b", "revised").map((item) => item.message))
      .toEqual(["first", "revised", "third"]);
  });

  it("keeps the original list when a move would cross the boundary", () => {
    expect(moveQueuedFollowUp(queued, "a", -1)).toEqual(queued);
    expect(moveQueuedFollowUp(queued, "c", 1)).toEqual(queued);
  });
});
