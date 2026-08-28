import { NextResponse } from "next/server";
import { readdirSync, statSync } from "fs";
import { homedir } from "os";
import { isAbsolute, resolve, dirname } from "path";
import { enforceCodingRequest } from "@/lib/auth/session-access";

const JUNK = new Set([
  "node_modules", ".git", ".next", "dist", "build", "__pycache__",
  ".turbo", ".cache", ".venv", "venv", ".DS_Store",
]);
const MAX_ENTRIES = 500;

function normalize(p: string): string {
  if (p === "~" || p === "") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return isAbsolute(p) ? resolve(p) : resolve(homedir(), p);
}

// POST /api/cwd/browse  body: { path: string }
// Directory listing (subdirectory names only) for the project picker's Browse
// mode and path autocomplete. Same trust model as /api/cwd/validate: picking
// a NEW workspace may point anywhere the server user can read — once chosen,
// that cwd becomes an allowed root anyway.
export async function POST(req: Request) {
  const denied = await enforceCodingRequest(req);
  if (denied) return denied;
  try {
    const body = await req.json() as { path?: unknown };
    const raw = typeof body.path === "string" ? body.path.trim() : "";
    const target = normalize(raw);

    let stat;
    try {
      stat = statSync(target);
    } catch {
      return NextResponse.json({ error: "Directory does not exist" }, { status: 400 });
    }
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    }

    let names: string[] = [];
    try {
      names = readdirSync(target, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !JUNK.has(e.name))
        .map((e) => e.name);
    } catch {
      return NextResponse.json({ error: "Directory is not readable" }, { status: 403 });
    }

    // Visible dirs first (alphabetical), dot-dirs after.
    names.sort((a, b) => {
      const da = a.startsWith(".") ? 1 : 0;
      const db = b.startsWith(".") ? 1 : 0;
      return da - db || a.localeCompare(b);
    });

    const parent = dirname(target);
    return NextResponse.json({
      path: target,
      parent: parent === target ? null : parent,
      home: homedir(),
      dirs: names.slice(0, MAX_ENTRIES),
      truncated: names.length > MAX_ENTRIES,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
