"use client";

import { useSyncExternalStore } from "react";

export const UI_STYLES = ["original", "trae"] as const;
export type UiStyle = (typeof UI_STYLES)[number];

export const DEFAULT_UI_STYLE: UiStyle = "trae";

/**
 * Keep explicit pre-split color choices on the original component geometry.
 * A legacy TRAE color choice (or no choice at all) maps to the TRAE geometry.
 */
export function normalizeUiStyle(
  value: string | null | undefined,
  legacySkin?: string | null,
): UiStyle {
  if (value && (UI_STYLES as readonly string[]).includes(value)) {
    return value as UiStyle;
  }
  if (legacySkin && legacySkin !== "trae") return "original";
  return DEFAULT_UI_STYLE;
}

const listeners = new Set<() => void>();
let uiStyle: UiStyle = DEFAULT_UI_STYLE;

if (typeof window !== "undefined") {
  try {
    uiStyle = normalizeUiStyle(
      localStorage.getItem("pi-ui-style"),
      localStorage.getItem("pi-skin"),
    );
  } catch {
    // Storage is best effort; retain the TRAE default.
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): UiStyle {
  return uiStyle;
}

function getServerSnapshot(): UiStyle {
  return DEFAULT_UI_STYLE;
}

export function setUiStyle(next: UiStyle): void {
  uiStyle = next;
  try {
    localStorage.setItem("pi-ui-style", next);
  } catch {
    // Preference persistence is best effort.
  }

  if (next === "trae") {
    document.documentElement.setAttribute("data-ui-style", next);
  } else {
    document.documentElement.removeAttribute("data-ui-style");
  }
  listeners.forEach((callback) => callback());
}

export function useUiStyle(): {
  uiStyle: UiStyle;
  setUiStyle: (style: UiStyle) => void;
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { uiStyle: current, setUiStyle };
}
