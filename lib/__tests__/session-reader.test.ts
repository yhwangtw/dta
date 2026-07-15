import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildSessionContext, buildTree, getLeafId, getSessionEntries } from "../session-reader";
import type { SessionEntry } from "../types";

// Helper to create a minimal SessionEntry
function entry(id: string, parentId?: string, extra?: Partial<SessionEntry>): SessionEntry {
  return {
    id,
    type: "message",
    role: "user",
    content: `msg-${id}`,
    timestamp: "2026-01-01T00:00:00Z",
    parentId,
    ...extra,
  } as unknown as SessionEntry;
}

function messageEntry(id: string, parentId: string | null = null): SessionEntry {
  return {
    id,
    type: "message",
    parentId,
    timestamp: "2026-01-01T00:00:00Z",
    message: { role: "user", content: `msg-${id}` },
  } as SessionEntry;
}

describe("getLeafId", () => {
  it("returns null for empty array", () => {
    expect(getLeafId([])).toBeNull();
  });

  it("returns the last entry's id", () => {
    const entries = [entry("a"), entry("b"), entry("c")];
    expect(getLeafId(entries)).toBe("c");
  });
});

describe("buildTree", () => {
  it("returns empty roots for empty entries", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("builds a flat list of independent entries", () => {
    const entries = [entry("a"), entry("b"), entry("c")];
    const tree = buildTree(entries);
    expect(tree).toHaveLength(3);
    expect(tree.map((n) => n.entry.id)).toEqual(["a", "b", "c"]);
  });

  it("nests children under parents", () => {
    const entries = [entry("a"), entry("b", "a"), entry("c", "b")];
    const tree = buildTree(entries);
    expect(tree).toHaveLength(1);
    expect(tree[0].entry.id).toBe("a");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].entry.id).toBe("b");
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].entry.id).toBe("c");
  });

  it("handles orphan entries (parent missing)", () => {
    const entries = [entry("b", "missing-parent")];
    const tree = buildTree(entries);
    expect(tree).toHaveLength(1);
    expect(tree[0].entry.id).toBe("b");
    expect(tree[0].children).toHaveLength(0);
  });

  it("sorts children by timestamp", () => {
    const entries = [
      entry("a"),
      entry("c", "a", { timestamp: "2026-01-03T00:00:00Z" }),
      entry("b", "a", { timestamp: "2026-01-02T00:00:00Z" }),
    ];
    const tree = buildTree(entries);
    expect(tree[0].children.map((n) => n.entry.id)).toEqual(["b", "c"]);
  });

  it("applies labels from label entries", () => {
    const entries = [
      entry("a"),
      { id: "label-1", type: "label", targetId: "a", label: "My Label" } as SessionEntry,
    ];
    const tree = buildTree(entries);
    expect(tree[0].label).toBe("My Label");
  });

  it("removes label when label entry has no label", () => {
    const entries = [
      entry("a"),
      { id: "label-1", type: "label", targetId: "a", label: "My Label" } as SessionEntry,
      { id: "label-2", type: "label", targetId: "a" } as SessionEntry,
    ];
    const tree = buildTree(entries);
    expect(tree[0].label).toBeUndefined();
  });
});

describe("buildSessionContext", () => {
  it("keeps entryIds parallel after compaction with custom and branch-summary messages", () => {
    const entries = [
      messageEntry("old-user"),
      {
        id: "custom-1",
        type: "custom_message",
        parentId: "old-user",
        timestamp: "2026-01-01T00:00:01Z",
        customType: "extension-note",
        content: "custom context",
        display: true,
      },
      {
        id: "branch-1",
        type: "branch_summary",
        parentId: "custom-1",
        timestamp: "2026-01-01T00:00:02Z",
        fromId: "old-user",
        summary: "branch context",
      },
      {
        id: "compact-1",
        type: "compaction",
        parentId: "branch-1",
        timestamp: "2026-01-01T00:00:03Z",
        summary: "older history",
        firstKeptEntryId: "custom-1",
        tokensBefore: 40_000,
      },
      messageEntry("new-user", "compact-1"),
    ] as SessionEntry[];

    const context = buildSessionContext(entries, "new-user");

    expect(context.messages).toHaveLength(4);
    expect(context.entryIds).toEqual(["compact-1", "custom-1", "branch-1", "new-user"]);
    expect(context.entryIds).toHaveLength(context.messages.length);
  });
});

describe("getSessionEntries", () => {
  it("migrates legacy entries in memory without rewriting the source JSONL", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-session-reader-"));
    const file = join(dir, "legacy.jsonl");
    const original = [
      JSON.stringify({ type: "session", version: 1, id: "legacy-session", timestamp: "2026-01-01T00:00:00Z", cwd: "/tmp/project" }),
      JSON.stringify({ type: "message", timestamp: "2026-01-01T00:00:01Z", message: { role: "user", content: "hello" } }),
      "",
    ].join("\n");
    writeFileSync(file, original);

    try {
      const entries = getSessionEntries(file);

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBeTruthy();
      expect(readFileSync(file, "utf8")).toBe(original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
