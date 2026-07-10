// ============================================================================
// Per-session transcript scroll memory. ChatWindow remounts on every session
// switch (key={sessionKey}), so positions live in a module-level map — they
// survive switches within a page load, and a fresh load falls back to the
// usual jump-to-bottom.
// ============================================================================

/** Sentinel: the reader was at (or near) the bottom — keep following. */
export const AT_BOTTOM = -1;

const positions = new Map<string, number>();

export function saveScrollPosition(key: string | null | undefined, scrollTop: number, distToBottom: number): void {
  if (!key) return;
  // Near-bottom readers get the sentinel so new content still opens at the
  // tail (an absolute offset would pin them above messages that arrived
  // while they were away).
  positions.set(key, distToBottom < 40 ? AT_BOTTOM : scrollTop);
}

export function loadScrollPosition(key: string | null | undefined): number | undefined {
  if (!key) return undefined;
  return positions.get(key);
}

/** Test hook. */
export function clearScrollPositions(): void {
  positions.clear();
}
