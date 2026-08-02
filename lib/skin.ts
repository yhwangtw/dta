"use client";

import { useSyncExternalStore } from "react";

// ============================================================================
// Appearance skins — complete visual palettes applied as token overrides via
// html[data-skin]. Same module-level-store pattern as theme/locale/toast.
// "terminal" is the base palette in globals.css (no attribute needed).
// ============================================================================

export const SKINS = ["trae", "terminal", "industrial", "aurora", "editorial", "glass"] as const;
export type Skin = (typeof SKINS)[number];

/** Default when the user hasn't picked one. */
export const DEFAULT_SKIN: Skin = "trae";

export const SKIN_LABELS: Record<Skin, string> = {
  trae: "TRAE (violet)",
  terminal: "Terminal (emerald)",
  industrial: "Industrial (mono)",
  aurora: "Aurora (violet)",
  editorial: "Editorial (warm)",
  glass: "Glass (frost)",
};

/**
 * Representative colors for the appearance picker's swatches. This is data
 * that *depicts* each skin (regardless of the active one), not styling — the
 * "no hardcoded colors in components" rule doesn't apply here.
 */
export const SKIN_PREVIEWS: Record<Skin, { light: string; dark: string; accent: string }> = {
  trae: { light: "#f6f6f5", dark: "#171719", accent: "#5b4ff6" },
  terminal: { light: "#f8faf9", dark: "#0c0e10", accent: "#0b7f5f" },
  industrial: { light: "#ffffff", dark: "#0a0a0a", accent: "#737373" },
  aurora: { light: "#fbfaff", dark: "#131020", accent: "#7c3aed" },
  editorial: { light: "#f8f5ee", dark: "#171310", accent: "#9a4508" },
  glass: { light: "#e9edfb", dark: "#0b0e1e", accent: "#5b5bd6" },
};

const listeners = new Set<() => void>();
let skin: Skin = DEFAULT_SKIN;

if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem("pi-skin");
    if (saved && (SKINS as readonly string[]).includes(saved)) skin = saved as Skin;
  } catch {
    // storage unavailable — stay on default
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Skin {
  return skin;
}

function getServerSnapshot(): Skin {
  return DEFAULT_SKIN;
}

export function setSkin(next: Skin): void {
  skin = next;
  try {
    localStorage.setItem("pi-skin", next);
  } catch {
    // ignore
  }
  if (next === "terminal") {
    document.documentElement.removeAttribute("data-skin");
  } else {
    document.documentElement.setAttribute("data-skin", next);
  }
  listeners.forEach((cb) => cb());
}

export function getSkin(): Skin {
  return skin;
}

export function useSkin(): { skin: Skin; setSkin: (s: Skin) => void } {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { skin: current, setSkin };
}
