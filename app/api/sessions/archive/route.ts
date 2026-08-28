import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { authenticateRequest, AuthenticationError, authenticationErrorResponse, type RequestPrincipal } from "@/lib/auth/request-auth";
import { assertSessionAccess } from "@/lib/auth/session-access";
import { ensureStateDirectory, userStatePath } from "@/lib/auth/user-state";

// Archived-session ids — same storage pattern as pins.json. Archiving hides a
// session from the default list without touching its .jsonl file.
export const dynamic = "force-dynamic";

interface ArchiveFile {
  archived: string[];
}

function getArchivePath(principal: RequestPrincipal): string {
  return userStatePath(principal, join(getAgentDir(), "archive.json"), "archive.json");
}

function readArchive(principal: RequestPrincipal): ArchiveFile {
  const path = getArchivePath(principal);
  if (!existsSync(path)) return { archived: [] };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<ArchiveFile>;
    return { archived: Array.isArray(raw.archived) ? raw.archived.filter((x): x is string => typeof x === "string") : [] };
  } catch {
    return { archived: [] };
  }
}

function writeArchive(principal: RequestPrincipal, data: ArchiveFile): void {
  const path = getArchivePath(principal);
  ensureStateDirectory(path);
  writeFileSync(path, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
}

// GET /api/sessions/archive — archived session ids.
export async function GET(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    return NextResponse.json(readArchive(principal));
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/sessions/archive  body: { id } — archive a session (idempotent).
export async function POST(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    const body = await req.json() as { id?: unknown };
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    assertSessionAccess(principal, body.id);
    const { archived } = readArchive(principal);
    if (!archived.includes(body.id)) {
      writeArchive(principal, { archived: [body.id, ...archived] });
    }
    return NextResponse.json(readArchive(principal));
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/sessions/archive  body: { id } — unarchive.
export async function DELETE(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    const body = await req.json() as { id?: unknown };
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    assertSessionAccess(principal, body.id);
    const { archived } = readArchive(principal);
    writeArchive(principal, { archived: archived.filter((x) => x !== body.id) });
    return NextResponse.json(readArchive(principal));
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
