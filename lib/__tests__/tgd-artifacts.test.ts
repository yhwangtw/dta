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
});
