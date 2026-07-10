import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { trimToUtf8Boundary, readTextPrefixSync } from "../text-prefix";

describe("trimToUtf8Boundary", () => {
  it("leaves pure ASCII untouched", () => {
    const buf = Buffer.from("hello world", "utf-8");
    expect(trimToUtf8Boundary(buf).toString("utf-8")).toBe("hello world");
  });

  it("keeps a complete multibyte character at the end", () => {
    const buf = Buffer.from("字", "utf-8"); // 3 bytes, complete
    expect(trimToUtf8Boundary(buf).toString("utf-8")).toBe("字");
  });

  it("drops a CJK character split by a byte cut", () => {
    const full = Buffer.from("ab字", "utf-8"); // 2 + 3 bytes
    const cut = full.subarray(0, 4); // splits 字 after its first byte
    expect(trimToUtf8Boundary(cut).toString("utf-8")).toBe("ab");
  });

  it("drops a 4-byte emoji split by a byte cut", () => {
    const full = Buffer.from("x😀", "utf-8"); // 1 + 4 bytes
    for (let cut = 2; cut < 5; cut++) {
      expect(trimToUtf8Boundary(full.subarray(0, cut)).toString("utf-8")).toBe("x");
    }
    expect(trimToUtf8Boundary(full).toString("utf-8")).toBe("x😀");
  });

  it("returns empty for a lone partial sequence", () => {
    const buf = Buffer.from("字", "utf-8").subarray(0, 2);
    expect(trimToUtf8Boundary(buf).length).toBe(0);
  });
});

describe("readTextPrefixSync", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "text-prefix-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads at most maxBytes without splitting characters", () => {
    const p = path.join(dir, "cjk.txt");
    writeFileSync(p, "一二三四五"); // 15 bytes
    expect(readTextPrefixSync(p, 7)).toBe("一二"); // 7 bytes cuts 三 mid-sequence
    expect(readTextPrefixSync(p, 9)).toBe("一二三");
    expect(readTextPrefixSync(p, 100)).toBe("一二三四五");
  });
});
