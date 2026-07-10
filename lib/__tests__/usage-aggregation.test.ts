import { describe, it, expect } from "vitest";
import { addUsage, emptyUsage } from "../usage-aggregation";

describe("addUsage", () => {
  it("sums complete usage records", () => {
    const t = emptyUsage();
    addUsage(t, { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2, total: 3.3 } });
    expect(t.input).toBe(100);
    expect(t.cost.total).toBe(3.3);
  });

  it("survives an errored run's usage with no cost (the 429 shape)", () => {
    const t = emptyUsage();
    addUsage(t, { input: 0, output: 0 }); // no cacheRead/cacheWrite/cost
    expect(t).toEqual(emptyUsage()); // no crash, no NaN
  });

  it("treats missing cost fields as zero instead of NaN-poisoning totals", () => {
    const t = emptyUsage();
    addUsage(t, { input: 10, output: 5, cost: { total: 0.01 } });
    addUsage(t, { input: 20, output: 10, cacheRead: 7, cost: { total: 0.02, input: 0.005 } });
    expect(t.input).toBe(30);
    expect(t.cacheRead).toBe(7);
    expect(t.cost.total).toBeCloseTo(0.03);
    expect(t.cost.input).toBeCloseTo(0.005);
    expect(Number.isNaN(t.cost.output)).toBe(false);
  });

  it("ignores null/undefined usage entirely", () => {
    const t = emptyUsage();
    addUsage(t, null);
    addUsage(t, undefined);
    expect(t).toEqual(emptyUsage());
  });
});
