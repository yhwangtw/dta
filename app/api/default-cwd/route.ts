import { NextResponse } from "next/server";
import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { enforceCodingRequest } from "@/lib/auth/session-access";

// POST /api/default-cwd
// Creates ~/pi-cwd-<YYYYMMDD> if it doesn't exist and returns the path.
export async function POST(req: Request) {
  const denied = await enforceCodingRequest(req);
  if (denied) return denied;
  try {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const dir = join(homedir(), `pi-cwd-${date}`);
    mkdirSync(dir, { recursive: true });
    return NextResponse.json({ cwd: dir });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
