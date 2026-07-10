import { describe, it, expect } from "vitest";
import { looksLikeFilePath } from "../file-links";

describe("looksLikeFilePath", () => {
  it("bare filename with known extension", () => {
    expect(looksLikeFilePath("package.json")).toEqual({ path: "package.json", line: undefined });
  });

  it("nested path", () => {
    expect(looksLikeFilePath("src/index.ts")).toEqual({ path: "src/index.ts", line: undefined });
  });

  it(":line suffix", () => {
    expect(looksLikeFilePath("src/index.ts:42")).toEqual({ path: "src/index.ts", line: 42 });
  });

  it(":line:col suffix", () => {
    expect(looksLikeFilePath("src/index.ts:42:7")).toEqual({ path: "src/index.ts", line: 42 });
  });

  it("relative prefixes qualify without a known extension", () => {
    expect(looksLikeFilePath("./scripts/build")).toEqual({ path: "./scripts/build", line: undefined });
    expect(looksLikeFilePath("/etc/hosts")).toEqual({ path: "/etc/hosts", line: undefined });
  });

  it("property access is not a file", () => {
    expect(looksLikeFilePath("state.contextUsage")).toBeNull();
    expect(looksLikeFilePath("object.property")).toBeNull();
  });

  it("prose slashes are not files", () => {
    expect(looksLikeFilePath("and/or")).toBeNull();
    expect(looksLikeFilePath("either/or")).toBeNull();
  });

  it("URLs are not files", () => {
    expect(looksLikeFilePath("https://example.com/a.ts")).toBeNull();
  });

  it("commands and identifiers are not files", () => {
    expect(looksLikeFilePath("useState")).toBeNull();
    expect(looksLikeFilePath("npm run build")).toBeNull();
  });

  it("trailing slash / dot dirs are not links", () => {
    expect(looksLikeFilePath("src/")).toBeNull();
    expect(looksLikeFilePath("..")).toBeNull();
  });

  it("well-known extension-less filenames are files", () => {
    expect(looksLikeFilePath("Makefile")).toEqual({ path: "Makefile", line: undefined });
    expect(looksLikeFilePath("Dockerfile")).toEqual({ path: "Dockerfile", line: undefined });
    expect(looksLikeFilePath("docker/Dockerfile")).toEqual({ path: "docker/Dockerfile", line: undefined });
    expect(looksLikeFilePath("Makefile:12")).toEqual({ path: "Makefile", line: 12 });
  });
});
