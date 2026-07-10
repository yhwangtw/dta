import { NextResponse } from "next/server";
import { getAllowedRoots, isPathAllowed } from "@/lib/file-security";
import { listWorktrees } from "@/lib/worktrees";

export const dynamic = "force-dynamic";

// GET /api/worktrees?cwd=<abs>
// Lists the git worktrees of the repo at cwd (main checkout first; prunable /
// missing checkouts filtered). Empty list for non-git dirs.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  const roots = await getAllowedRoots();
  if (!isPathAllowed(cwd, roots)) {
    return NextResponse.json({ error: "cwd not allowed" }, { status: 403 });
  }

  try {
    return NextResponse.json({ worktrees: await listWorktrees(cwd) });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
