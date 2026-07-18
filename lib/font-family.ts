"use client";

import { useSyncExternalStore } from "react";

export const FONT_FAMILIES = ["sans", "mono", "system"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

export const DEFAULT_FONT_FAMILY: FontFamily = "sans";

export function normalizeFontFamily(value: string | null | undefined): FontFamily {
  return value && (FONT_FAMILIES as readonly string[]).includes(value)
    ? value as FontFamily
    : DEFAULT_FONT_FAMILY;
}

const listeners = new Set<() => void>();
let fontFamily: FontFamily = DEFAULT_FONT_FAMILY;

if (typeof window !== "undefined") {
  try {
    fontFamily = normalizeFontFamily(localStorage.getItem("pi-font-family"));
  } catch {
    // Storage unavailable — keep the bundled sans stack.
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): FontFamily {
  return fontFamily;
}

function getServerSnapshot(): FontFamily {
  return DEFAULT_FONT_FAMILY;
}

export function setFontFamily(next: FontFamily): void {
  fontFamily = next;
  try {
    localStorage.setItem("pi-font-family", next);
  } catch {
    // Preference persistence is best effort.
  }

  if (next === DEFAULT_FONT_FAMILY) {
    document.documentElement.removeAttribute("data-font-family");
  } else {
    document.documentElement.setAttribute("data-font-family", next);
  }
  listeners.forEach((callback) => callback());
}

export function useFontFamily(): {
  fontFamily: FontFamily;
  setFontFamily: (family: FontFamily) => void;
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { fontFamily: current, setFontFamily };
}
