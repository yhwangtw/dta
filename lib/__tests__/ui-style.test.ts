// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_UI_STYLE,
  normalizeUiStyle,
  setUiStyle,
  UI_STYLES,
} from "../ui-style";

describe("interface-style preference", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-ui-style");
    setUiStyle(DEFAULT_UI_STYLE);
  });

  it("accepts supported styles and rejects stale storage values", () => {
    for (const style of UI_STYLES) {
      expect(normalizeUiStyle(style)).toBe(style);
    }
    expect(normalizeUiStyle("rounded")).toBe(DEFAULT_UI_STYLE);
  });

  it("preserves original geometry for an explicit legacy color choice", () => {
    expect(normalizeUiStyle(null, "editorial")).toBe("original");
    expect(normalizeUiStyle(null, "terminal")).toBe("original");
    expect(normalizeUiStyle(null, "trae")).toBe("trae");
    expect(normalizeUiStyle(null, null)).toBe("trae");
  });

  it("persists TRAE independently from the color palette", () => {
    localStorage.setItem("pi-skin", "aurora");
    setUiStyle("trae");

    expect(localStorage.getItem("pi-ui-style")).toBe("trae");
    expect(localStorage.getItem("pi-skin")).toBe("aurora");
    expect(document.documentElement.getAttribute("data-ui-style")).toBe("trae");
  });

  it("removes only the TRAE geometry selector when returning to original", () => {
    document.documentElement.setAttribute("data-skin", "glass");
    setUiStyle("original");

    expect(localStorage.getItem("pi-ui-style")).toBe("original");
    expect(document.documentElement.hasAttribute("data-ui-style")).toBe(false);
    expect(document.documentElement.getAttribute("data-skin")).toBe("glass");
  });
});
