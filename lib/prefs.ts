"use client";

// ============================================================================
// Small persisted UI preferences that need to be readable from both React
// components and non-reactive code (e.g. the scroll logic in useAgentSession).
// ============================================================================

const FOLLOW_KEY = "pi-follow-stream";

/**
 * Terminal-style "always follow output": when on, the view engages sticky
 * follow at run start and end-of-run always scrolls to the bottom. Default
 * off — the reading-position-first scroll contract stays the default.
 */
export function getAlwaysFollow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(FOLLOW_KEY) === "1";
  } catch {
    return false;
  }
}

/** Flip the preference; returns the new value. */
export function toggleAlwaysFollow(): boolean {
  const next = !getAlwaysFollow();
  try {
    if (next) localStorage.setItem(FOLLOW_KEY, "1");
    else localStorage.removeItem(FOLLOW_KEY);
  } catch {
    // storage unavailable — treat as session-only toggle
  }
  return next;
}
