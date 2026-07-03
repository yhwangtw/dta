import { describe, it, expect } from "vitest";
import { getTagStyle, getTagColorName, TAG_COLOR_NAMES } from "../tag-colors";

describe("getTagColorName", () => {
  it("returns a valid palette slot", () => {
    const color = getTagColorName("urgent");
    expect(TAG_COLOR_NAMES).toContain(color);
  });

  it("is deterministic — same input always returns same color", () => {
    expect(getTagColorName("urgent")).toBe(getTagColorName("urgent"));
    expect(getTagColorName("todo")).toBe(getTagColorName("todo"));
  });

  it("ignores a leading # (normalizes like useTags does)", () => {
    expect(getTagColorName("#urgent")).toBe(getTagColorName("urgent"));
  });

  it("is case-insensitive", () => {
    expect(getTagColorName("URGENT")).toBe(getTagColorName("urgent"));
  });

  it("distributes tags across multiple palette slots over a sample", () => {
    // 16 random-ish tags should hit at least 3 different colors (8-bucket
    // palette; sampling 16 → birthday-paradox almost guarantees variety).
    const seen = new Set<string>();
    for (let i = 0; i < 16; i++) {
      seen.add(getTagColorName(`tag-${i}-${i * 7}`));
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("falls back to a stable color for empty input", () => {
    const c1 = getTagColorName("");
    const c2 = getTagColorName("");
    expect(c1).toBe(c2);
    expect(TAG_COLOR_NAMES).toContain(c1);
  });
});

describe("getTagStyle", () => {
  it("returns a complete style triple in light mode", () => {
    const s = getTagStyle("urgent", "light");
    expect(s.bg).toMatch(/^rgba?\(.*\)$/);
    expect(s.fg).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(s.border).toMatch(/^rgba?\(.*\)$/);
    expect(s.color).toBe(getTagColorName("urgent"));
  });

  it("returns a different bg in dark mode", () => {
    const light = getTagStyle("urgent", "light");
    const dark = getTagStyle("urgent", "dark");
    // dark mode usually uses higher alpha; either way the strings should differ
    expect(dark.bg).not.toBe(light.bg);
    expect(dark.fg).not.toBe(light.fg);
  });

  it("defaults to light mode when mode is omitted", () => {
    const s = getTagStyle("foo");
    const light = getTagStyle("foo", "light");
    expect(s).toEqual(light);
  });
});
