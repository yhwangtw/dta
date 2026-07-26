import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isTrustedAgentRunWorkspace } from "../agent-run-workspace";

const dirs: string[] = [];

function fixtureDir(name: string): string {
  const value = mkdtempSync(join(tmpdir(), `${name}-`));
  dirs.push(value);
  return value;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("agent run workspace trust", () => {
  it("AC-3.7: accepts a real directory inside a trusted workspace", async () => {
    const root = fixtureDir("pi-agent-trusted");
    const child = join(root, "packages", "app");
    mkdirSync(child, { recursive: true });

    await expect(isTrustedAgentRunWorkspace(child, new Set([root]))).resolves.toBe(true);
  });

  it("AC-3.8: rejects a symlink that escapes a trusted workspace", async () => {
    const root = fixtureDir("pi-agent-trusted");
    const outside = fixtureDir("pi-agent-outside");
    const link = join(root, "outside-link");
    symlinkSync(outside, link, "dir");

    await expect(isTrustedAgentRunWorkspace(link, new Set([root]))).resolves.toBe(false);
  });
});
