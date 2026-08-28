import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { authenticateRequest, AuthenticationError, authenticationErrorResponse, type RequestPrincipal } from "@/lib/auth/request-auth";
import { assertSessionAccess } from "@/lib/auth/session-access";
import { ensureStateDirectory, userStatePath } from "@/lib/auth/user-state";

// User-level state, not model config. Stored separately from models.json so
// that future migrations of either file don't conflict.
export const dynamic = "force-dynamic";

interface PinsFile {
  pinned: string[]; // session ids in pin order (most recent first)
}

function getPinsPath(principal: RequestPrincipal): string {
  return userStatePath(principal, join(getAgentDir(), "pins.json"), "pins.json");
}

function readPins(principal: RequestPrincipal): PinsFile {
  const path = getPinsPath(principal);
  if (!existsSync(path)) return { pinned: [] };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<PinsFile>;
    return { pinned: Array.isArray(raw.pinned) ? raw.pinned.filter((x): x is string => typeof x === "string") : [] };
  } catch {
    return { pinned: [] };
  }
}

function writePins(principal: RequestPrincipal, data: PinsFile): void {
  const path = getPinsPath(principal);
  ensureStateDirectory(path);
  writeFileSync(path, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
}

// GET /api/sessions/pins — return the list of pinned session ids.
export async function GET(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    return NextResponse.json(readPins(principal));
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/sessions/pins  body: { id: string } — pin a session.
// Idempotent: pinning an already-pinned id moves it to the front of the list.
export async function POST(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    const body = await req.json() as { id?: unknown };
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    assertSessionAccess(principal, body.id);
    const { pinned } = readPins(principal);
    const next = [body.id, ...pinned.filter((x) => x !== body.id)];
    writePins(principal, { pinned: next });
    return NextResponse.json({ pinned: next });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/sessions/pins  body: { id: string } — unpin a session.
// Idempotent: deleting an id that isn't pinned is a no-op.
export async function DELETE(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    const body = await req.json() as { id?: unknown };
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    assertSessionAccess(principal, body.id);
    const { pinned } = readPins(principal);
    const next = pinned.filter((x) => x !== body.id);
    writePins(principal, { pinned: next });
    return NextResponse.json({ pinned: next });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
