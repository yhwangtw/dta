import { describe, expect, it } from "vitest";
import { parseVisualAnalysis } from "../integrations/vision/vision-provider";

describe("vision provider", () => {
  it("normalizes observations onto sampled frame timestamps", () => {
    const result = parseVisualAnalysis({
      summary: "Product demo",
      observations: [{ timestamp_seconds: 29, summary: "Dashboard shown", visible_text: "Conversion 42%" }],
    }, [0, 30, 60]);
    expect(result).toEqual({
      summary: "Product demo",
      observations: [{ timestampSeconds: 30, summary: "Dashboard shown", visibleText: "Conversion 42%" }],
    });
  });
});
