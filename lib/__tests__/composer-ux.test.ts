// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadDraft, saveDraft, clearDraft, loadHistory, saveHistory } from "../composer-persistence";
import { shouldFencePaste, fencePaste } from "../paste-fence";

describe("composer draft persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a draft per key", () => {
    saveDraft("s1", "hello 世界");
    saveDraft("s2", "other");
    expect(loadDraft("s1")).toBe("hello 世界");
    expect(loadDraft("s2")).toBe("other");
  });

  it("clearing removes only that key", () => {
    saveDraft("s1", "a");
    saveDraft("s2", "b");
    clearDraft("s1");
    expect(loadDraft("s1")).toBe("");
    expect(loadDraft("s2")).toBe("b");
  });

  it("empty value removes the stored draft", () => {
    saveDraft("s1", "a");
    saveDraft("s1", "");
    expect(localStorage.getItem("pi-draft:s1")).toBeNull();
  });

  it("null key is a no-op", () => {
    saveDraft(null, "x");
    expect(loadDraft(null)).toBe("");
  });

  it("history round-trips and caps at 50", () => {
    saveHistory("s1", Array.from({ length: 60 }, (_, i) => `msg${i}`));
    const h = loadHistory("s1");
    expect(h).toHaveLength(50);
    expect(h[49]).toBe("msg59");
    expect(h[0]).toBe("msg10");
  });

  it("history survives corrupt storage", () => {
    localStorage.setItem("pi-history:s1", "{not json");
    expect(loadHistory("s1")).toEqual([]);
  });
});

describe("paste auto-fence", () => {
  it("fences an obvious code paste", () => {
    const code = `function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));\n`;
    expect(shouldFencePaste(code)).toBe(true);
    expect(fencePaste(code)).toBe("```\nfunction add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));\n```");
  });

  it("fences indentation-heavy pastes (e.g. python without braces)", () => {
    const py = `def hello(name):\n    msg = f"hi {name}"\n    print(msg)\n    return msg\nhello("pi")`;
    expect(shouldFencePaste(py)).toBe(true);
  });

  it("leaves prose alone", () => {
    const prose = `這是第一段說明文字。\n這是第二段。\n這是第三段,講一些需求。\n最後一段收尾。`;
    expect(shouldFencePaste(prose)).toBe(false);
  });

  it("leaves short pastes alone", () => {
    expect(shouldFencePaste("const x = 1;")).toBe(false);
    expect(shouldFencePaste("a\nb\nc")).toBe(false);
  });

  it("never double-fences", () => {
    expect(shouldFencePaste("```js\nconst x = 1;\nconst y = 2;\nconst z = 3;\n```")).toBe(false);
  });
});
