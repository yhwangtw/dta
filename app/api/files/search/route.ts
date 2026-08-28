import { NextResponse } from "next/server";
import { readdirSync } from "fs";
import path from "path";
import { getAllowedRoots, isPathAllowed, IGNORED_NAMES } from "@/lib/file-security";
import { enforceCodingRequest } from "@/lib/auth/session-access";

const MAX_RESULTS = 200;
const MAX_DEPTH = 8;
const MAX_DIRS_VISITED = 4000;

interface SearchHit {
  name: string;
  /** Path relative to the searched cwd (what the UI shows and @-mentions). */
  relative: string;
  /** Absolute path (what file-open APIs take). */
  full: string;
  isDir: boolean;
}

// GET /api/files/search?cwd=<abs>&q=<substring>
// Recursive filename search under an allowed project root. Breadth-first so
// shallow matches (usually what the user means) fill the cap before deep ones.
export async function GET(req: Request) {
  const denied = await enforceCodingRequest(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  if (!cwd || !q) {
    return NextResponse.json({ error: "cwd and q are required" }, { status: 400 });
  }

  const allowed = await getAllowedRoots();
  if (!isPathAllowed(cwd, allowed)) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
  }

  const results: SearchHit[] = [];
  let dirsVisited = 0;
  const queue: { dir: string; depth: number }[] = [{ dir: cwd, depth: 0 }];

  while (queue.length > 0 && results.length < MAX_RESULTS && dirsVisited < MAX_DIRS_VISITED) {
    const { dir, depth } = queue.shift()!;
    dirsVisited++;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable dir — skip
    }
    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const isDir = entry.isDirectory();
      if (entry.name.toLowerCase().includes(q)) {
        results.push({
          name: entry.name,
          relative: path.relative(cwd, full),
          full,
          isDir,
        });
        if (results.length >= MAX_RESULTS) break;
      }
      if (isDir && depth + 1 <= MAX_DEPTH) {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }

  return NextResponse.json({
    results,
    truncated: results.length >= MAX_RESULTS || dirsVisited >= MAX_DIRS_VISITED,
  });
}
