import { describe, expect, it } from "vitest";
import {
  DEFAULT_FONT_FAMILY,
  FONT_FAMILIES,
  normalizeFontFamily,
} from "../font-family";

describe("font-family preference", () => {
  it("accepts every supported family and rejects stale storage values", () => {
    for (const family of FONT_FAMILIES) {
      expect(normalizeFontFamily(family)).toBe(family);
    }
    expect(normalizeFontFamily("serif")).toBe(DEFAULT_FONT_FAMILY);
    expect(normalizeFontFamily(null)).toBe(DEFAULT_FONT_FAMILY);
  });

  it("uses the bundled sans stack by default", () => {
    expect(DEFAULT_FONT_FAMILY).toBe("sans");
  });
});
