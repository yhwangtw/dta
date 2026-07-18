import { describe, expect, it } from "vitest";
import { artifactPhaseCommands } from "../ChatWindow";

describe("artifactPhaseCommands", () => {
  const top = [
    { name: "CONTEXT.md", phase: "map" },
    { name: "TRACKING-PLAN.md", phase: "plan" },
    { name: "CHANGELOG.md", phase: "release" },
  ];

  it("uses feature-scoped verify and review evidence without treating a global changelog as release evidence", () => {
    expect([...artifactPhaseCommands(top, {
      phasesDone: ["define", "plan", "verify", "review"],
    })]).toEqual([
      "/tgd-map", "/tgd-define", "/tgd-plan", "/tgd-verify", "/tgd-review",
    ]);
  });

  it("marks release done from feature-scoped release evidence", () => {
    expect(artifactPhaseCommands(top, {
      phasesDone: ["release"],
    }).has("/tgd-release")).toBe(true);
  });
});
