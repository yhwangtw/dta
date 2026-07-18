import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { readTgdArtifacts } from "@/lib/tgd-artifacts";

describe("readTgdArtifacts", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("discovers nested HTML prototypes and labels them by relative path", () => {
    const root = mkdtempSync(join(tmpdir(), "tgd-artifacts-"));
    roots.push(root);
    const project = join(root, "demo");
    const feature = join(root, "demo-tGD", "notification-center");
    mkdirSync(project);
    mkdirSync(join(feature, "prototype", "conservative"), { recursive: true });
    mkdirSync(join(feature, "prototype", "strong-fit"), { recursive: true });
    writeFileSync(join(feature, "PRD.md"), "# Notification center\n");
    writeFileSync(join(feature, "prototype", "overview.html"), "<h1>Overview</h1>\n");
    writeFileSync(join(feature, "prototype", "conservative", "index.html"), "<h1>Conservative</h1>\n");
    writeFileSync(join(feature, "prototype", "strong-fit", "index.html"), "<h1>Strong fit</h1>\n");
    writeFileSync(join(feature, "prototype", "README.md"), "Not a prototype preview\n");

    const artifacts = readTgdArtifacts(project);

    expect(artifacts.features).toHaveLength(1);
    expect(artifacts.features[0].prototypes.map(({ name }) => name)).toEqual([
      "conservative/index.html",
      "overview.html",
      "strong-fit/index.html",
    ]);
    expect(artifacts.features[0].prototypes.map(({ path }) => path)).toEqual([
      join(feature, "prototype", "conservative", "index.html"),
      join(feature, "prototype", "overview.html"),
      join(feature, "prototype", "strong-fit", "index.html"),
    ]);
  });

  it("discovers the complete tGD lifecycle and maps reports to their phases", () => {
    const root = mkdtempSync(join(tmpdir(), "tgd-artifacts-"));
    roots.push(root);
    const project = join(root, "demo");
    const tgdDir = join(root, "demo-tGD");
    const feature = join(tgdDir, "notification-center");
    mkdirSync(project);
    mkdirSync(feature, { recursive: true });

    for (const name of ["CONTEXT.md", "TRACKING-PLAN.md", "CHANGELOG.md", "REGRESSION-CATALOG.md"]) {
      writeFileSync(join(tgdDir, name), `# ${name}\n`);
    }
    for (const name of [
      "PRD.md", "SPEC.md", "DESIGN.md", "TASKS.md",
      "TEST-REPORT.md", "REVIEW.md", "METRICS.md",
    ]) {
      writeFileSync(join(feature, name), `# ${name}\n`);
    }

    const artifacts = readTgdArtifacts(project);

    expect(artifacts.top.map(({ name, phase }) => ({ name, phase }))).toEqual([
      { name: "CONTEXT.md", phase: "map" },
      { name: "TRACKING-PLAN.md", phase: "plan" },
      { name: "CHANGELOG.md", phase: "release" },
      { name: "REGRESSION-CATALOG.md", phase: "release" },
    ]);
    expect(artifacts.features[0].docs.map(({ name, phase }) => ({ name, phase }))).toEqual([
      { name: "PRD.md", phase: "define" },
      { name: "SPEC.md", phase: "define" },
      { name: "DESIGN.md", phase: "define" },
      { name: "TASKS.md", phase: "plan" },
      { name: "TEST-REPORT.md", phase: "verify" },
      { name: "REVIEW.md", phase: "review" },
      { name: "METRICS.md", phase: "release" },
    ]);
    expect(artifacts.features[0].phasesDone).toEqual(["define", "plan", "verify", "review", "release"]);
  });
});
