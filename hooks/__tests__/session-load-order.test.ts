import { describe, expect, it } from "vitest";
import { shouldApplySessionLoad } from "../use-agent-session-types";

describe("session load ordering", () => {
  it("rejects an older response after a model change invalidates it", () => {
    expect(shouldApplySessionLoad(4, 5)).toBe(false);
    expect(shouldApplySessionLoad(5, 5)).toBe(true);
  });
});
