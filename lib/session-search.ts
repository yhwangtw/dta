export interface SessionSearchMatch {
  entryId: string;
  role: "user" | "assistant";
  text: string;
  line: number;
}

interface SearchableEntry {
  type?: unknown;
  id?: unknown;
  message?: {
    role?: unknown;
    content?: unknown;
  };
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (!block || typeof block !== "object") return "";
      const value = block as { type?: unknown; text?: unknown };
      return value.type === "text" && typeof value.text === "string" ? value.text : "";
    })
    .filter(Boolean)
    .join(" ");
}

/** Pure search over already-parsed entries; never opens or rewrites a session. */
export function searchSessionEntries(
  entries: readonly SearchableEntry[],
  query: string,
  limit = 8,
): SessionSearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle || limit <= 0) return [];

  const matches: SessionSearchMatch[] = [];
  for (let line = 0; line < entries.length && matches.length < limit; line++) {
    const entry = entries[line];
    if (entry.type !== "message" || typeof entry.id !== "string" || !entry.message) continue;
    const role = entry.message.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = messageText(entry.message.content);
    const index = text.toLowerCase().indexOf(needle);
    if (index < 0) continue;

    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + needle.length + 60);
    matches.push({
      entryId: entry.id,
      role,
      text: `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`,
      line,
    });
  }
  return matches;
}
