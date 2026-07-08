import { NextResponse } from "next/server";
import { getAllowedRoots } from "@/lib/file-security";
import { readTgdArtifacts } from "@/lib/tgd-artifacts";

export const dynamic = "force-dynamic";

// GET /api/tgd/artifacts?cwd=<projectCwd>
// Lists the tGD artifacts (PRD/SPEC/DESIGN/TASKS/METRICS, CONTEXT, wiki,
// prototypes) from the project's sibling `<project>-tGD/` directory.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  const roots = await getAllowedRoots();
  if (!roots.has(cwd)) {
    return NextResponse.json({ error: "cwd not allowed" }, { status: 403 });
  }

  try {
    return NextResponse.json(readTgdArtifacts(cwd));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
