import { describe, it, expect, beforeEach } from "vitest";
import { saveTreeExpansion, loadTreeExpansion, clearTreeExpansions } from "../tree-expansion-memory";

describe("tree-expansion-memory", () => {
  beforeEach(() => clearTreeExpansions());

  it("returns an empty set for a never-visited cwd", () => {
    expect(loadTreeExpansion("/a").size).toBe(0);
  });

  it("round-trips a saved expansion per cwd", () => {
    saveTreeExpansion("/a", new Set(["/a/src", "/a/src/lib"]));
    saveTreeExpansion("/b", new Set(["/b/docs"]));
    expect([...loadTreeExpansion("/a")].sort()).toEqual(["/a/src", "/a/src/lib"]);
    expect([...loadTreeExpansion("/b")]).toEqual(["/b/docs"]);
  });

  it("returns copies — mutating the loaded set does not corrupt the store", () => {
    saveTreeExpansion("/a", new Set(["/a/src"]));
    loadTreeExpansion("/a").add("/a/evil");
    expect(loadTreeExpansion("/a").has("/a/evil")).toBe(false);
  });

  it("later saves overwrite earlier ones for the same cwd", () => {
    saveTreeExpansion("/a", new Set(["/a/src"]));
    saveTreeExpansion("/a", new Set(["/a/docs"]));
    expect([...loadTreeExpansion("/a")]).toEqual(["/a/docs"]);
  });

  it("ignores null/undefined cwd", () => {
    saveTreeExpansion(null, new Set(["x"]));
    expect(loadTreeExpansion(null).size).toBe(0);
    expect(loadTreeExpansion(undefined).size).toBe(0);
  });

  it("evicts the least-recently-saved cwd past the cap", () => {
    for (let i = 0; i < 30; i++) saveTreeExpansion(`/p${i}`, new Set([`/p${i}/x`]));
    saveTreeExpansion("/p0", new Set(["/p0/x"])); // refresh p0's recency
    saveTreeExpansion("/p30", new Set(["/p30/x"])); // 31st → evict oldest (p1)
    expect(loadTreeExpansion("/p0").size).toBe(1);
    expect(loadTreeExpansion("/p1").size).toBe(0);
    expect(loadTreeExpansion("/p30").size).toBe(1);
  });
});
