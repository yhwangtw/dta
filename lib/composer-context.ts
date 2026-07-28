export interface ComposerMention {
  path: string;
  raw: string;
  start: number;
  end: number;
}

/**
 * Extract completed `@file` references from composer text. The autocomplete
 * inserts either `@path` or `@"path with spaces"`; incomplete quoted mentions
 * and email addresses intentionally stay plain text.
 */
export function extractComposerMentions(value: string): ComposerMention[] {
  const mentions: ComposerMention[] = [];
  const pattern = /(^|\s)@(?:"([^"]+)"|([^\s"]+))/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const prefixLength = match[1]?.length ?? 0;
    const raw = match[0].slice(prefixLength);
    const start = match.index + prefixLength;
    mentions.push({
      path: match[2] ?? match[3],
      raw,
      start,
      end: start + raw.length,
    });
  }

  return mentions;
}

/** Remove one mention and collapse only the whitespace created by removal. */
export function removeComposerMention(value: string, mention: ComposerMention): string {
  const before = value.slice(0, mention.start);
  const after = value.slice(mention.end);
  if (/\s$/.test(before) && /^\s/.test(after)) {
    return before + after.replace(/^\s+/, "");
  }
  return before + after;
}
