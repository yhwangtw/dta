// ============================================================================
// Content search across a project tree.
//
// Prefers ripgrep (fast, respects .gitignore, skips binaries) and falls back
// to a bounded pure-JS scan when `rg` isn't on PATH — so the feature works on
// any self-host box without assuming ripgrep is installed.
// ============================================================================

import { execFile } from "child_process";
import { promisify } from "util";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

export interface GrepMatch {
  /** Path relative to the searched root (what the UI shows). */
  relative: string;
  /** Absolute path (what the file-open API takes). */
  full: string;
  line: number;
  /** 1-based column of the first match on the line (best-effort). */
  col: number;
  /** The matching line, trimmed to a sane length. */
  text: string;
}

export interface GrepResult {
  matches: GrepMatch[];
  truncated: boolean;
  /** "rg" or "js" — which engine served the result (handy for debugging). */
  engine: "rg" | "js";
}

const LINE_CLAMP = 400; // don't ship enormous minified lines to the client

function clampLine(s: string): string {
  return s.length > LINE_CLAMP ? s.slice(0, LINE_CLAMP) + "…" : s;
}

/** Parse `rg --json` stream output into matches. */
export function parseRgJson(stdout: string, root: string, maxResults: number): GrepMatch[] {
  const out: GrepMatch[] = [];
  for (const raw of stdout.split("\n")) {
    if (!raw || out.length >= maxResults) break;
    let evt: unknown;
    try { evt = JSON.parse(raw); } catch { continue; }
    const e = evt as { type?: string; data?: {
      path?: { text?: string };
      lines?: { text?: string };
      line_number?: number;
      submatches?: { start?: number }[];
    } };
    if (e.type !== "match" || !e.data?.path?.text) continue;
    const full = e.data.path.text;
    out.push({
      relative: path.relative(root, full),
      full,
      line: e.data.line_number ?? 0,
      col: (e.data.submatches?.[0]?.start ?? 0) + 1,
      text: clampLine((e.data.lines?.text ?? "").replace(/\r?\n$/, "")),
    });
  }
  return out;
}

async function grepWithRg(
  root: string, query: string, opts: { caseSensitive: boolean; maxResults: number },
): Promise<GrepMatch[]> {
  const args = [
    "--json", "--fixed-strings",
    opts.caseSensitive ? "--case-sensitive" : "--ignore-case",
    "--max-count", "50",       // per-file cap
    "--max-filesize", "1M",
    "--", query, root,
  ];
  const { stdout } = await execFileAsync("rg", args, {
    timeout: 15_000,
    maxBuffer: 32 * 1024 * 1024,
  }).catch((err: NodeJS.ErrnoException & { stdout?: string; code?: number }) => {
    // rg exits 1 when there are simply no matches — that's not an error.
    if (err.code === 1 && typeof err.stdout === "string") return { stdout: err.stdout };
    throw err;
  });
  return parseRgJson(stdout, root, opts.maxResults);
}

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "__pycache__",
  ".turbo", ".cache", "coverage", ".pytest_cache", ".mypy_cache", "target", "vendor",
]);

/** Cheap binary sniff: a NUL byte in the first chunk. */
function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Bounded pure-JS scan used when ripgrep isn't available. */
export function grepWithJs(
  root: string, query: string,
  opts: { caseSensitive: boolean; maxResults: number; maxFiles?: number },
): GrepMatch[] {
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  const out: GrepMatch[] = [];
  const maxFiles = opts.maxFiles ?? 5000;
  let filesScanned = 0;
  const queue: string[] = [root];

  while (queue.length > 0 && out.length < opts.maxResults && filesScanned < maxFiles) {
    const dir = queue.shift()!;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) queue.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (out.length >= opts.maxResults || filesScanned >= maxFiles) break;
      try {
        if (statSync(full).size > 1024 * 1024) continue; // skip >1MB
        const buf = readFileSync(full);
        if (looksBinary(buf)) continue;
        filesScanned++;
        const lines = buf.toString("utf-8").split("\n");
        for (let i = 0; i < lines.length; i++) {
          const hay = opts.caseSensitive ? lines[i] : lines[i].toLowerCase();
          const col = hay.indexOf(needle);
          if (col >= 0) {
            out.push({
              relative: path.relative(root, full),
              full,
              line: i + 1,
              col: col + 1,
              text: clampLine(lines[i].replace(/\r$/, "")),
            });
            if (out.length >= opts.maxResults) break;
          }
        }
      } catch { /* unreadable — skip */ }
    }
  }
  return out;
}

/**
 * Search `root` for `query` (literal substring). Tries ripgrep, falls back to
 * the JS scanner if `rg` is missing or errors.
 */
export async function grepProject(
  root: string, query: string,
  opts: { caseSensitive?: boolean; maxResults?: number } = {},
): Promise<GrepResult> {
  const caseSensitive = opts.caseSensitive ?? false;
  const maxResults = opts.maxResults ?? 300;
  try {
    const matches = await grepWithRg(root, query, { caseSensitive, maxResults });
    return { matches, truncated: matches.length >= maxResults, engine: "rg" };
  } catch {
    const matches = grepWithJs(root, query, { caseSensitive, maxResults });
    return { matches, truncated: matches.length >= maxResults, engine: "js" };
  }
}
