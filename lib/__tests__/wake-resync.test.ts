import { describe, it, expect } from "vitest";
import { shouldResyncOnVisible } from "../wake-resync";

describe("shouldResyncOnVisible", () => {
  it("does not resync when the tab was never hidden", () => {
    expect(shouldResyncOnVisible(null, 10_000)).toBe(false);
  });

  it("does not resync after a brief hide (tab flick)", () => {
    expect(shouldResyncOnVisible(10_000, 11_000)).toBe(false); // 1s < 3s
  });

  it("resyncs after the screen was off for a while", () => {
    expect(shouldResyncOnVisible(10_000, 20_000)).toBe(true); // 10s
  });

  it("honors a custom threshold", () => {
    expect(shouldResyncOnVisible(0, 500, 300)).toBe(true);
    expect(shouldResyncOnVisible(0, 200, 300)).toBe(false);
  });
});
