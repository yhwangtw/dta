import { NextResponse } from "next/server";
import { getAllowedRoots, isPathAllowed } from "@/lib/file-security";
import { grepProject } from "@/lib/grep";
import { enforceCodingRequest } from "@/lib/auth/session-access";

export const dynamic = "force-dynamic";

// GET /api/files/grep?cwd=<abs>&q=<text>&case=1
// Full-text search under an allowed project root (ripgrep, JS fallback).
export async function GET(req: Request) {
  const denied = await enforceCodingRequest(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd") ?? "";
  const q = url.searchParams.get("q") ?? "";
  const caseSensitive = url.searchParams.get("case") === "1";

  if (!cwd || !q) {
    return NextResponse.json({ error: "cwd and q are required" }, { status: 400 });
  }
  // Very short queries match almost everything and are slow to render — skip.
  if (q.length < 2) {
    return NextResponse.json({ matches: [], truncated: false, engine: "none" });
  }

  const allowed = await getAllowedRoots();
  if (!isPathAllowed(cwd, allowed)) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
  }

  try {
    return NextResponse.json(await grepProject(cwd, q, { caseSensitive }));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
