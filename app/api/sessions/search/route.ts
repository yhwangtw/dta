import { NextResponse } from "next/server";
import { resolveSessionPath, listAllSessions, getSessionEntries } from "@/lib/session-reader";
import { searchSessionEntries, type SessionSearchMatch } from "@/lib/session-search";
import { authenticateRequest, AuthenticationError, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { accessibleSessionIds } from "@/lib/auth/session-access";

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
  matches: SessionSearchMatch[];
  totalMatches: number;
}

// Search all sessions: name + firstMessage + all message contents.
// Scans up to 200 most-recent sessions to bound work; older sessions are
// skipped with a `truncated` flag in the response.
export async function GET(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    const allowed = accessibleSessionIds(principal);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 500);

    if (q.length < 1) {
      return NextResponse.json({ hits: [], truncated: false, query: q });
    }

    const all = (await listAllSessions()).filter((session) => !allowed || allowed.has(session.id));
    // Most-recent first
    all.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    const slice = all.slice(0, limit);
    const truncated = all.length > slice.length;

    const needle = q.toLowerCase();
    const hits: SearchHit[] = [];

    for (const s of slice) {
      const filePath = await resolveSessionPath(s.id);
      if (!filePath) continue;

      let matchedIn: SearchHit["matchedIn"] = "messages";

      // 1. Check session name
      if (s.name?.toLowerCase().includes(needle)) {
        matchedIn = "name";
      }

      // 2. Check firstMessage
      if (matchedIn === "messages" && s.firstMessage.toLowerCase().includes(needle)) {
        matchedIn = "firstMessage";
      }

      // 3. Parse in memory and scan message entries. SessionManager.open() is
      // deliberately avoided because it may rewrite empty/corrupted files.
      let entries;
      try {
        entries = getSessionEntries(filePath);
      } catch {
        continue;
      }
      const matches = searchSessionEntries(entries, needle);

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
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
