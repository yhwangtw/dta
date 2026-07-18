import { describe, expect, it } from "vitest";
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_SCALES,
  FONT_SIZES,
  normalizeFontSize,
} from "../font-size";

describe("font-size preference", () => {
  it("accepts every supported size and rejects stale storage values", () => {
    for (const size of FONT_SIZES) {
      expect(normalizeFontSize(size)).toBe(size);
    }
    expect(normalizeFontSize("huge")).toBe(DEFAULT_FONT_SIZE);
    expect(normalizeFontSize(null)).toBe(DEFAULT_FONT_SIZE);
  });

  it("keeps the default at 100% and increases each larger step", () => {
    expect(FONT_SIZE_SCALES.default).toBe(1);
    expect(FONT_SIZE_SCALES.small).toBeLessThan(1);
    expect(FONT_SIZE_SCALES.large).toBeGreaterThan(1);
    expect(FONT_SIZE_SCALES.xlarge).toBeGreaterThan(FONT_SIZE_SCALES.large);
  });
});
