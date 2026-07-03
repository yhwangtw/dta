/**
 * Tag color encoding — deterministic, hash-based palette mapping.
 *
 * Why a hash? Tag names are user-defined free-form strings (no central
 * registry), so we need a stable function tagName → color. djb2 is fast,
 * well-distributed enough for visual separation across an 8-bucket palette,
 * and small enough to inline if we ever need to.
 *
 * Each color has two variants — light + dark — selected by the host app's
 * `data-theme` / `html.dark` class. Consumers should pass `mode` from
 * `useTheme()` so colors track the live theme.
 */

export type TagColorName =
  | "blue"
  | "green"
  | "orange"
  | "purple"
  | "pink"
  | "cyan"
  | "yellow"
  | "red";

export type ColorMode = "light" | "dark";

export interface TagStyle {
  /** Background tint (low-alpha, sits on top of --bg). */
  bg: string;
  /** Foreground text/icon color — high contrast against bg. */
  fg: string;
  /** Border tint, slightly stronger than bg. */
  border: string;
  /** Which palette slot the tag maps to. Useful for tests / debugging. */
  color: TagColorName;
}

interface PaletteEntry {
  light: { bg: string; fg: string; border: string };
  dark: { bg: string; fg: string; border: string };
}

/**
 * 8-color palette. Each entry was hand-tuned to:
 *  - read clearly on both `#ffffff` and `#1a1a1a`
 *  - not look like the destructive `--color-error` red or the warning yellow
 *  - stay distinguishable when placed side-by-side as chips
 *
 * alpha values kept low (0.08–0.16) so the chip doesn't fight the row bg.
 */
const PALETTE: Record<TagColorName, PaletteEntry> = {
  blue: {
    light: { bg: "rgba(37, 99, 235, 0.10)", fg: "#1d4ed8", border: "rgba(37, 99, 235, 0.30)" },
    dark:  { bg: "rgba(96, 165, 250, 0.14)", fg: "#93c5fd", border: "rgba(96, 165, 250, 0.35)" },
  },
  green: {
    light: { bg: "rgba(22, 163, 74, 0.10)", fg: "#15803d", border: "rgba(22, 163, 74, 0.30)" },
    dark:  { bg: "rgba(74, 222, 128, 0.14)", fg: "#86efac", border: "rgba(74, 222, 128, 0.40)" },
  },
  orange: {
    light: { bg: "rgba(234, 88, 12, 0.10)", fg: "#c2410c", border: "rgba(234, 88, 12, 0.30)" },
    dark:  { bg: "rgba(251, 146, 60, 0.14)", fg: "#fdba74", border: "rgba(251, 146, 60, 0.40)" },
  },
  purple: {
    light: { bg: "rgba(124, 58, 237, 0.10)", fg: "#6d28d9", border: "rgba(124, 58, 237, 0.30)" },
    dark:  { bg: "rgba(167, 139, 250, 0.14)", fg: "#c4b5fd", border: "rgba(167, 139, 250, 0.40)" },
  },
  pink: {
    light: { bg: "rgba(219, 39, 119, 0.10)", fg: "#be185d", border: "rgba(219, 39, 119, 0.30)" },
    dark:  { bg: "rgba(244, 114, 182, 0.14)", fg: "#f9a8d4", border: "rgba(244, 114, 182, 0.40)" },
  },
  cyan: {
    light: { bg: "rgba(8, 145, 178, 0.10)", fg: "#0e7490", border: "rgba(8, 145, 178, 0.30)" },
    dark:  { bg: "rgba(34, 211, 238, 0.14)", fg: "#67e8f9", border: "rgba(34, 211, 238, 0.40)" },
  },
  yellow: {
    light: { bg: "rgba(202, 138, 4, 0.12)", fg: "#a16207", border: "rgba(202, 138, 4, 0.35)" },
    dark:  { bg: "rgba(250, 204, 21, 0.16)", fg: "#fde047", border: "rgba(250, 204, 21, 0.40)" },
  },
  red: {
    light: { bg: "rgba(220, 38, 38, 0.10)", fg: "#b91c1c", border: "rgba(220, 38, 38, 0.30)" },
    dark:  { bg: "rgba(248, 113, 113, 0.14)", fg: "#fca5a5", border: "rgba(248, 113, 113, 0.40)" },
  },
};

const PALETTE_ORDER: TagColorName[] = [
  "blue", "green", "orange", "purple", "pink", "cyan", "yellow", "red",
];

/** djb2 string hash — see http://www.cse.yorku.ca/~oz/hash.html */
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + c, with unsigned coercion to keep negative chars from
    // making the high bit set (we only care about low bits here, but it
    // also avoids any signed-shift surprises in callers).
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Pick a palette slot for the given tag name. Same input → same output, so
 * the chip color stays stable as the user navigates around. The leading
 * `#` is stripped first so `#foo` and `foo` hash the same — matches what
 * `useTags` already does for normalization.
 */
function pickColor(tag: string): TagColorName {
  const norm = tag.replace(/^#/, "").toLowerCase().trim();
  const h = djb2(norm || "untagged");
  return PALETTE_ORDER[h % PALETTE_ORDER.length];
}

/**
 * Get the inline style triple for a tag chip. Pass `mode: "dark"` to get
 * the dark-mode-tuned variant; default is "light".
 *
 * @example
 *   const style = getTagStyle("urgent");
 *   <span style={{ background: style.bg, color: style.fg, borderColor: style.border }}>#urgent</span>
 */
export function getTagStyle(tag: string, mode: ColorMode = "light"): TagStyle {
  const color = pickColor(tag);
  const entry = PALETTE[color][mode];
  return { color, ...entry };
}

/**
 * Pure variant — returns just the palette slot name. Useful when you want
 * to apply the color via a CSS class (e.g. `.tag-blue`) instead of inline
 * styles. CSS for each slot lives in `TagFilter.module.css` / etc.
 */
export function getTagColorName(tag: string): TagColorName {
  return pickColor(tag);
}

export const TAG_PALETTE = PALETTE;
export const TAG_COLOR_NAMES = PALETTE_ORDER;
