import { describe, it, expect } from "vitest";
import { toggleOriginFromEvent } from "../useTheme";

describe("toggleOriginFromEvent", () => {
  it("returns the control's center, ignoring pointer coords", () => {
    const el = {
      getBoundingClientRect: () => ({ left: 100, top: 40, width: 20, height: 20 }),
    } as unknown as Element;
    expect(toggleOriginFromEvent({ currentTarget: el })).toEqual({ x: 110, y: 50 });
  });

  it("is keyboard-safe (does not read clientX/Y)", () => {
    // A keyboard-triggered click reports clientX/Y = 0; the center must still win.
    const el = {
      getBoundingClientRect: () => ({ left: 8, top: 200, width: 32, height: 32 }),
    } as unknown as Element;
    expect(toggleOriginFromEvent({ currentTarget: el })).toEqual({ x: 24, y: 216 });
  });
});
