// ============================================================================
// Per-cwd file-tree expansion memory. The explorer used to reset its expanded
// set on every cwd switch, so hopping A→B→A collapsed the whole tree. Expanded
// paths live in a module-level map keyed by cwd — they survive switches within
// a page load; a fresh load starts collapsed as before.
// ============================================================================

const expansions = new Map<string, Set<string>>();

/** Oldest entries are dropped past this cap (paranoia; cwds are few). */
const MAX_CWDS = 30;

export function saveTreeExpansion(cwd: string | null | undefined, expanded: Set<string>): void {
  if (!cwd) return;
  // Re-insert so iteration order tracks recency for the eviction below.
  expansions.delete(cwd);
  expansions.set(cwd, new Set(expanded));
  if (expansions.size > MAX_CWDS) {
    const oldest = expansions.keys().next().value;
    if (oldest !== undefined) expansions.delete(oldest);
  }
}

export function loadTreeExpansion(cwd: string | null | undefined): Set<string> {
  if (!cwd) return new Set();
  const saved = expansions.get(cwd);
  return saved ? new Set(saved) : new Set();
}

/** Test hook. */
export function clearTreeExpansions(): void {
  expansions.clear();
}
