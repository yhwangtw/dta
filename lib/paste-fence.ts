// ============================================================================
// Auto-fence pasted code in the composer. A multiline code paste used to go
// in as bare text — the model copes, but the transcript's markdown render
// mangles it (stray *, _, # become formatting). Conservative heuristic: only
// clearly code-shaped pastes get wrapped, prose stays untouched.
// ============================================================================

const CODE_TOKENS = /[{};]|=>|\breturn\b|\bimport\b|\bexport\b|\bfunction\b|\bconst\b|\blet\b|\bdef\b|\bclass\b|\bfn\b|\bpub\b|<\/[a-z]+>|<[A-Za-z]+[ >]|^\s*(?:if|for|while)\s*\(/m;

/**
 * Should this pasted text be wrapped in a code fence?
 * - at least 4 lines (short pastes are usually prose or a path)
 * - not already fenced
 * - code-shaped: several indented lines OR obvious code tokens
 */
export function shouldFencePaste(text: string): boolean {
  if (!text || text.includes("```")) return false;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 4) return false;
  const indented = lines.filter((l) => /^(\s{2,}|\t)/.test(l)).length;
  const looksIndentedCode = indented >= Math.max(2, Math.floor(lines.length * 0.3));
  return looksIndentedCode || CODE_TOKENS.test(text);
}

/** Wrap pasted text in a fence, normalizing trailing newlines. */
export function fencePaste(text: string): string {
  const body = text.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  return "```\n" + body + "\n```";
}
