import { describe, it, expect } from "vitest";
import { buildExtensionsReport, type RunnerLike } from "../extensions-info";

function fakeRunner(overrides: Partial<RunnerLike> = {}): RunnerLike {
  return {
    getExtensionPaths: () => ["/home/u/.pi/agent/extensions/foo.ts"],
    getRegisteredCommands: () => [
      { name: "tgd-map", invocationName: "tgd-map", description: "Map the codebase", sourceInfo: { path: "/ext/tgd.ts" } },
    ],
    getAllRegisteredTools: () => [
      { definition: { name: "codegraph", description: "Query the code graph" }, sourceInfo: { path: "/ext/tgd.ts" } },
    ],
    getFlags: () => new Map([
      ["verbose", { name: "verbose", type: "boolean" as const, default: false, extensionPath: "/ext/tgd.ts" }],
    ]),
    getFlagValues: () => new Map<string, boolean | string>(),
    getCommandDiagnostics: () => [],
    getShortcutDiagnostics: () => [],
    ...overrides,
  };
}

describe("buildExtensionsReport", () => {
  it("serializes paths, commands, tools", () => {
    const r = buildExtensionsReport(fakeRunner());
    expect(r.paths).toEqual(["/home/u/.pi/agent/extensions/foo.ts"]);
    expect(r.commands[0]).toMatchObject({ name: "tgd-map", description: "Map the codebase", source: "/ext/tgd.ts" });
    expect(r.tools[0]).toMatchObject({ name: "codegraph", source: "/ext/tgd.ts" });
  });

  it("merges flag values over defaults", () => {
    const r = buildExtensionsReport(fakeRunner({
      getFlagValues: () => new Map<string, boolean | string>([["verbose", true]]),
    }));
    expect(r.flags[0]).toMatchObject({ name: "verbose", default: false, value: true });
  });

  it("falls back to the default when a flag has no explicit value", () => {
    const r = buildExtensionsReport(fakeRunner());
    expect(r.flags[0].value).toBe(false);
  });

  it("surfaces hard load failures as error diagnostics", () => {
    const r = buildExtensionsReport(fakeRunner(), [
      { path: "/ext/broken.js", error: "SyntaxError: Unexpected token" },
    ]);
    expect(r.diagnostics[0]).toMatchObject({
      type: "error",
      message: "SyntaxError: Unexpected token",
      path: "/ext/broken.js",
    });
  });

  it("dedupes diagnostics reported by both loaders", () => {
    const d = { type: "error" as const, message: "SyntaxError in foo.ts", path: "/ext/foo.ts" };
    const r = buildExtensionsReport(fakeRunner({
      getCommandDiagnostics: () => [d],
      getShortcutDiagnostics: () => [d, { type: "warning", message: "other", path: undefined }],
    }));
    expect(r.diagnostics).toHaveLength(2);
    expect(r.diagnostics[0]).toMatchObject({ type: "error", message: "SyntaxError in foo.ts" });
  });
});
