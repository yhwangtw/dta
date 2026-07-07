import { NextResponse } from "next/server";
import { getAllowedRoots } from "@/lib/file-security";
import { restoreSnapshot } from "@/lib/git-snapshot";

export const dynamic = "force-dynamic";

// POST /api/git/snapshots/restore  body: { cwd, sessionId, id }
// Reverts the working tree to the snapshot, touching only the changed files.
export async function POST(req: Request) {
  try {
    const body = await req.json() as { cwd?: string; sessionId?: string; id?: string };
    const { cwd, sessionId, id } = body;
    if (!cwd || !sessionId || !id) {
      return NextResponse.json({ error: "cwd, sessionId and id required" }, { status: 400 });
    }
    const roots = await getAllowedRoots();
    if (!roots.has(cwd)) {
      return NextResponse.json({ error: "cwd not allowed" }, { status: 403 });
    }
    const result = await restoreSnapshot(cwd, sessionId, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
