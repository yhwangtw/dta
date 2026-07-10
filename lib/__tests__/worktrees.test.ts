import { describe, it, expect } from "vitest";
import { parseWorktreePorcelain } from "../worktrees";

const SAMPLE = `worktree /home/u/proj
HEAD 1111111111111111111111111111111111111111
branch refs/heads/main

worktree /home/u/proj-feature
HEAD 2222222222222222222222222222222222222222
branch refs/heads/feature-x

worktree /home/u/proj-detached
HEAD 3333333333333333333333333333333333333333
detached

worktree /home/u/proj-gone
HEAD 4444444444444444444444444444444444444444
branch refs/heads/old
prunable gitdir file points to non-existent location
`;

describe("parseWorktreePorcelain", () => {
  it("parses paths, branches, and marks the first entry as main", () => {
    const w = parseWorktreePorcelain(SAMPLE);
    expect(w).toHaveLength(4);
    expect(w[0]).toMatchObject({ path: "/home/u/proj", branch: "main", isMain: true, prunable: false });
    expect(w[1]).toMatchObject({ path: "/home/u/proj-feature", branch: "feature-x", isMain: false });
  });

  it("detached checkouts have a null branch", () => {
    const w = parseWorktreePorcelain(SAMPLE);
    expect(w[2]).toMatchObject({ path: "/home/u/proj-detached", branch: null });
  });

  it("flags prunable entries", () => {
    const w = parseWorktreePorcelain(SAMPLE);
    expect(w[3].prunable).toBe(true);
  });

  it("empty output → empty list", () => {
    expect(parseWorktreePorcelain("")).toEqual([]);
  });
});
