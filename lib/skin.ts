"use client";

import { useSyncExternalStore } from "react";

// ============================================================================
// Appearance skins — complete visual palettes applied as token overrides via
// html[data-skin]. Same module-level-store pattern as theme/locale/toast.
// "terminal" is the base palette in globals.css (no attribute needed).
// ============================================================================

export const SKINS = ["terminal", "industrial", "aurora", "editorial"] as const;
export type Skin = (typeof SKINS)[number];

/** Default when the user hasn't picked one. */
export const DEFAULT_SKIN: Skin = "editorial";

export const SKIN_LABELS: Record<Skin, string> = {
  terminal: "Terminal (emerald)",
  industrial: "Industrial (mono)",
  aurora: "Aurora (violet)",
  editorial: "Editorial (warm)",
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
