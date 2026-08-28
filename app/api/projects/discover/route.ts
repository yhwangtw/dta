import { NextResponse } from "next/server";
import { readdirSync, existsSync } from "fs";
import { homedir } from "os";
import path from "path";
import { IGNORED_NAMES } from "@/lib/file-security";
import { enforceCodingRequest } from "@/lib/auth/session-access";

export const dynamic = "force-dynamic";

// Directories that are never project parents — skipping them keeps the scan
// fast even in big home dirs.
const SKIP = new Set([
  ...IGNORED_NAMES,
  "Library", "Applications", "Pictures", "Music", "Movies", "Downloads",
  "AppData", "snap", "go", ".local", ".cache", ".npm", ".cargo", ".rustup",
]);

const MAX_DEPTH = 3;
const MAX_DIRS = 3_000;
const MAX_RESULTS = 60;
const CACHE_TTL_MS = 60_000;

declare global {
  var __piDiscoverCache: { repos: { path: string; name: string }[]; expiresAt: number } | undefined;
}

// GET /api/projects/discover
// Shallow scan of the home directory for git repos (dirs containing .git),
// so the project switcher has candidates even before any session exists.
// BFS, bounded, doesn't descend into found repos; cached for 60s.
export async function GET(req: Request) {
  const denied = await enforceCodingRequest(req);
  if (denied) return denied;
  const now = Date.now();
  const cached = globalThis.__piDiscoverCache;
  if (cached && cached.expiresAt > now) {
    return NextResponse.json({ repos: cached.repos });
  }

  const home = homedir();
  const repos: { path: string; name: string }[] = [];
  const queue: { dir: string; depth: number }[] = [{ dir: home, depth: 0 }];
  let visited = 0;

  while (queue.length > 0 && repos.length < MAX_RESULTS && visited < MAX_DIRS) {
    const { dir, depth } = queue.shift()!;
    visited++;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (existsSync(path.join(full, ".git"))) {
        repos.push({ path: full, name: e.name });
        if (repos.length >= MAX_RESULTS) break;
        continue; // a repo's subdirs are not separate projects
      }
      if (depth + 1 <= MAX_DEPTH) queue.push({ dir: full, depth: depth + 1 });
    }
  }

  repos.sort((a, b) => a.name.localeCompare(b.name));
  globalThis.__piDiscoverCache = { repos, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json({ repos });
}
