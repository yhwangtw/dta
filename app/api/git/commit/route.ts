import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getAllowedRoots } from "@/lib/file-security";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    maxBuffer: 8 * 1024 * 1024,
    timeout: 20_000,
  });
  return stdout;
}

// POST /api/git/commit
//   { cwd, message }                       stage everything, then commit
//   { cwd, message, paths: string[] }      stage only these paths, then commit
//   { cwd, action: "discard", path }       revert one file to HEAD (or delete
//                                           it if untracked)
export async function POST(req: Request) {
  let body: { cwd?: string; message?: string; paths?: string[]; action?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { cwd } = body;
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  const roots = await getAllowedRoots();
  if (!roots.has(cwd)) {
    return NextResponse.json({ error: "cwd not allowed" }, { status: 403 });
  }

  try {
    await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return NextResponse.json({ error: "Not a git repository" }, { status: 400 });
  }

  try {
    // ── Discard one file ──
    if (body.action === "discard") {
      const p = body.path;
      if (!p) return NextResponse.json({ error: "path required" }, { status: 400 });
      // Untracked files aren't in HEAD — `checkout` won't touch them; remove.
      const tracked = await git(cwd, ["ls-files", "--error-unmatch", "--", p]).then(() => true).catch(() => false);
      if (tracked) {
        await git(cwd, ["checkout", "HEAD", "--", p]);
      } else {
        await git(cwd, ["clean", "-fd", "--", p]);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Commit ──
    const message = (body.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "Commit message is required" }, { status: 400 });

    if (Array.isArray(body.paths) && body.paths.length > 0) {
      await git(cwd, ["add", "--", ...body.paths]);
    } else {
      await git(cwd, ["add", "-A"]);
    }

    // Nothing staged → don't create an empty commit.
    const staged = await git(cwd, ["diff", "--cached", "--name-only"]);
    if (!staged.trim()) {
      return NextResponse.json({ error: "Nothing staged to commit" }, { status: 400 });
    }

    await git(cwd, ["commit", "-m", message]);
    const sha = (await git(cwd, ["rev-parse", "--short", "HEAD"])).trim();
    return NextResponse.json({ ok: true, sha });
  } catch (error) {
    // git writes the useful part to stderr
    const e = error as { stderr?: string; message?: string };
    return NextResponse.json({ error: (e.stderr || e.message || String(error)).trim() }, { status: 500 });
  }
}
