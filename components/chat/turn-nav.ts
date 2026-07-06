/**
 * Turn navigation (⌥↑ / ⌥↓): pick which user message to jump to, given the
 * viewport-relative top offsets of every user message in document order.
 *
 * "prev" = the last message that starts above the viewport top;
 * "next" = the first message that starts below it. The epsilon keeps the
 * message currently aligned at the top from matching itself, so repeated
 * presses walk turn by turn — it must stay larger than the .msg-item
 * scroll-margin-top (10px), which offsets the settled alignment position.
 */
export function pickTurnTarget(tops: number[], dir: "prev" | "next"): number | null {
  const EPS = 16;
  if (dir === "next") {
    for (let i = 0; i < tops.length; i++) {
      if (tops[i] > EPS) return i;
    }
    return null;
  }
  for (let i = tops.length - 1; i >= 0; i--) {
    if (tops[i] < -EPS) return i;
  }
  return null;
}
