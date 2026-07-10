// ============================================================================
// Composer draft + sent-history persistence, keyed per session. Both used to
// live only in component memory: a refresh, crash, or session switch threw
// away whatever was typed, and ArrowUp history reset every page load.
// ============================================================================

const DRAFT_PREFIX = "pi-draft:";
const HISTORY_PREFIX = "pi-history:";
const HISTORY_MAX = 50;
const DRAFT_MAX_BYTES = 64 * 1024; // don't let a pasted book bloat localStorage

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // e.g. blocked in some embedded contexts
  }
}

export function loadDraft(key: string | null): string {
  if (!key) return "";
  try {
    return storage()?.getItem(DRAFT_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

export function saveDraft(key: string | null, value: string): void {
  if (!key) return;
  try {
    const s = storage();
    if (!s) return;
    if (!value || value.length > DRAFT_MAX_BYTES) {
      if (!value) s.removeItem(DRAFT_PREFIX + key);
      return;
    }
    s.setItem(DRAFT_PREFIX + key, value);
  } catch {
    // quota exceeded etc. — a lost draft is the pre-existing behavior
  }
}

export function clearDraft(key: string | null): void {
  if (!key) return;
  try {
    storage()?.removeItem(DRAFT_PREFIX + key);
  } catch { /* ignore */ }
}

export function loadHistory(key: string | null): string[] {
  if (!key) return [];
  try {
    const raw = storage()?.getItem(HISTORY_PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveHistory(key: string | null, history: string[]): void {
  if (!key) return;
  try {
    storage()?.setItem(HISTORY_PREFIX + key, JSON.stringify(history.slice(-HISTORY_MAX)));
  } catch { /* ignore */ }
}
