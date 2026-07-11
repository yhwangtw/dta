// Decide whether to resync after the tab becomes visible again. Mobile
// browsers freeze background tabs and kill the SSE stream; a quick tab flick
// shouldn't trigger a reload, but coming back after the screen was off should.

export function shouldResyncOnVisible(
  hiddenSince: number | null,
  now: number,
  minHiddenMs = 3000,
): boolean {
  if (hiddenSince === null) return false;
  return now - hiddenSince >= minHiddenMs;
}
