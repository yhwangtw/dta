export type StreamingSendMode = "steer" | "followup";

const STORAGE_KEY = "pi-stream-send-mode";

export function resolveStreamingSendMode(
  modifiers: { altKey: boolean; metaKey: boolean; ctrlKey: boolean },
  selected: StreamingSendMode,
): StreamingSendMode {
  if (modifiers.altKey) return "steer";
  if (modifiers.metaKey || modifiers.ctrlKey) return "followup";
  return selected;
}

export function loadStreamingSendMode(): StreamingSendMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "steer" ? "steer" : "followup";
  } catch {
    return "followup";
  }
}

export function saveStreamingSendMode(mode: StreamingSendMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Preference persistence is best effort in embedded/private contexts.
  }
}
