export interface DictationAppendResult {
  text: string;
  accepted: boolean;
}

export function appendMeetingDictation(
  current: string,
  spoken: string,
  maxChars: number,
): DictationAppendResult {
  const normalized = spoken.trim();
  if (!normalized) return { text: current, accepted: true };
  const prefix = current.trimEnd();
  const next = `${prefix}${prefix ? "\n" : ""}${normalized}`;
  return next.length <= maxChars
    ? { text: next, accepted: true }
    : { text: current, accepted: false };
}
