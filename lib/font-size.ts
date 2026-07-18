"use client";

import { useSyncExternalStore } from "react";

export const FONT_SIZES = ["small", "default", "large", "xlarge"] as const;
export type FontSize = (typeof FONT_SIZES)[number];

export const DEFAULT_FONT_SIZE: FontSize = "default";

export const FONT_SIZE_SCALES: Record<FontSize, number> = {
  small: 0.9,
  default: 1,
  large: 1.15,
  xlarge: 1.3,
};

export function normalizeFontSize(value: string | null | undefined): FontSize {
  return value && (FONT_SIZES as readonly string[]).includes(value)
    ? value as FontSize
    : DEFAULT_FONT_SIZE;
}

const listeners = new Set<() => void>();
let fontSize: FontSize = DEFAULT_FONT_SIZE;

if (typeof window !== "undefined") {
  try {
    fontSize = normalizeFontSize(localStorage.getItem("pi-font-size"));
  } catch {
    // Storage unavailable — keep the accessible default.
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): FontSize {
  return fontSize;
}

function getServerSnapshot(): FontSize {
  return DEFAULT_FONT_SIZE;
}

export function setFontSize(next: FontSize): void {
  fontSize = next;
  try {
    localStorage.setItem("pi-font-size", next);
  } catch {
    // Preference persistence is best effort.
  }

  if (next === DEFAULT_FONT_SIZE) {
    document.documentElement.removeAttribute("data-font-size");
  } else {
    document.documentElement.setAttribute("data-font-size", next);
  }
  listeners.forEach((callback) => callback());
}

export function useFontSize(): { fontSize: FontSize; setFontSize: (size: FontSize) => void } {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { fontSize: current, setFontSize };
}
