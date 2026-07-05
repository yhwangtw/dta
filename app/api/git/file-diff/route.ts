import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { resolve, sep } from "path";
import { getAllowedRoots } from "@/lib/file-security";

const execFileAsync = promisify(execFile);
const MAX_BYTES = 1024 * 1024; // 1 MB per side is plenty for a readable diff

// GET /api/git/file-diff?cwd=…&path=… — HEAD vs working-tree contents of one
// file, for the client-side DiffView. Empty oldText = new file; empty
// newText = deleted file.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd");
  const relPath = url.searchParams.get("path");
  if (!cwd || !relPath) {
    return NextResponse.json({ error: "cwd and path required" }, { status: 400 });
  }
  const roots = await getAllowedRoots();
  if (!roots.has(cwd)) {
    return NextResponse.json({ error: "cwd not allowed" }, { status: 403 });
  }
  // Constrain to the repo and keep git from parsing the path as a flag
  const abs = resolve(cwd, relPath);
  if (!abs.startsWith(cwd + sep) || relPath.startsWith("-")) {
    return NextResponse.json({ error: "path not allowed" }, { status: 403 });
  }

  try {
    let oldText = "";
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["-C", cwd, "show", `HEAD:${relPath.split(sep).join("/")}`],
        { maxBuffer: MAX_BYTES, timeout: 10_000 },
      );
      oldText = stdout;
    } catch {
      // untracked / newly added — no HEAD version
    }

    let newText = "";
    try {
      const buf = await readFile(abs);
      if (buf.length > MAX_BYTES) {
        return NextResponse.json({ tooLarge: true, oldText: "", newText: "" });
      }
      newText = buf.toString("utf8");
    } catch {
      // deleted from the working tree
    }

    return NextResponse.json({ oldText, newText });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
