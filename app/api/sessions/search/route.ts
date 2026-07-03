import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolveSessionPath, listAllSessions } from "@/lib/session-reader";

export const dynamic = "force-dynamic";

interface SearchHit {
  id: string;
  cwd: string;
  name?: string;
  firstMessage: string;
  created: string;
  modified: string;
  messageCount: number;
  matchedIn: "name" | "firstMessage" | "messages";
  matches: Array<{ entryId: string; role: string; text: string; line: number }>;
  totalMatches: number;
}

// Search all sessions: name + firstMessage + all message contents.
// Scans up to 200 most-recent sessions to bound work; older sessions are
// skipped with a `truncated` flag in the response.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 500);

    if (q.length < 1) {
      return NextResponse.json({ hits: [], truncated: false, query: q });
    }

    const all = await listAllSessions();
    // Most-recent first
    all.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    const slice = all.slice(0, limit);
    const truncated = all.length > slice.length;

    const needle = q.toLowerCase();
    const hits: SearchHit[] = [];

    for (const s of slice) {
      const filePath = await resolveSessionPath(s.id);
      if (!filePath || !existsSync(filePath)) continue;

      const matches: SearchHit["matches"] = [];
      let matchedIn: SearchHit["matchedIn"] = "messages";

      // 1. Check session name
      if (s.name?.toLowerCase().includes(needle)) {
        matchedIn = "name";
      }

      // 2. Check firstMessage
      if (matchedIn === "messages" && s.firstMessage.toLowerCase().includes(needle)) {
        matchedIn = "firstMessage";
      }

      // 3. Scan all message entries for matches
      let sm: ReturnType<typeof SessionManager.open>;
      try {
        sm = SessionManager.open(filePath);
      } catch {
        continue;
      }

      const entries = sm.getEntries() as Array<{ type: string; id: string; message?: { role: string; content: unknown } }>;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.type !== "message" || !e.message) continue;
        const role = e.message.role;
        if (role !== "user" && role !== "assistant") continue;

        const c = e.message.content;
        let text = "";
        if (typeof c === "string") text = c;
        else if (Array.isArray(c)) {
          text = c
            .map((b) => {
              if (typeof b === "string") return b;
              const o = b as { type: string; text?: string };
              return o.type === "text" ? o.text ?? "" : "";
            })
            .join(" ");
        }
        if (!text) continue;

        const idx = text.toLowerCase().indexOf(needle);
        if (idx >= 0) {
          // Capture ±40 chars of context around the match
          const start = Math.max(0, idx - 40);
          const end = Math.min(text.length, idx + needle.length + 60);
          const snippet = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
          matches.push({ entryId: e.id, role, text: snippet, line: i });
          if (matches.length >= 8) break; // cap matches per session
        }
      }

      if (matches.length > 0 || matchedIn !== "messages") {
        hits.push({
          id: s.id,
          cwd: s.cwd,
          name: s.name,
          firstMessage: s.firstMessage,
          created: s.created,
          modified: s.modified,
          messageCount: s.messageCount,
          matchedIn,
          matches,
          totalMatches: matches.length,
        });
      }
    }

    // Sort by total matches desc, then by recency
    hits.sort((a, b) => {
      if (b.totalMatches !== a.totalMatches) return b.totalMatches - a.totalMatches;
      return new Date(b.modified).getTime() - new Date(a.modified).getTime();
    });

    return NextResponse.json({ hits, truncated, query: q, scanned: slice.length });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
