import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

export interface Worktree {
  path: string;
  /** Branch name without refs/heads/, or null when detached. */
  branch: string | null;
  head: string | null;
  /** First entry in porcelain output = the main checkout. */
  isMain: boolean;
}

/**
 * Parse `git worktree list --porcelain` output. Blocks are separated by blank
 * lines; each has `worktree <path>`, `HEAD <sha>`, and `branch <ref>` or
 * `detached`, plus optional `locked`/`prunable` annotations.
 */
export function parseWorktreePorcelain(out: string): (Worktree & { prunable: boolean })[] {
  const blocks = out.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const result: (Worktree & { prunable: boolean })[] = [];
  for (const block of blocks) {
    let path = "";
    let branch: string | null = null;
    let head: string | null = null;
    let prunable = false;
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
      else if (line.startsWith("HEAD ")) head = line.slice("HEAD ".length);
      else if (line.startsWith("branch ")) branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
      else if (line === "detached") branch = null;
      else if (line.startsWith("prunable")) prunable = true;
    }
    if (path) result.push({ path, branch, head, isMain: result.length === 0, prunable });
  }
  return result;
}

/**
 * List a repo's worktrees (main checkout first). Prunable or missing-on-disk
 * entries are dropped — Git happily reports checkouts whose directories are
 * gone, and offering those as switch targets would only produce errors.
 * Returns [] for non-git dirs.
 */
export async function listWorktrees(cwd: string): Promise<Worktree[]> {
  try {
    const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
      cwd,
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    });
    return parseWorktreePorcelain(stdout)
      .filter((w) => !w.prunable && existsSync(w.path))
      .map(({ prunable: _prunable, ...w }) => w);
  } catch {
    return [];
  }
}
