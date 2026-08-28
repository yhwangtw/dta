import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { authenticateRequest, AuthenticationError, authenticationErrorResponse, type RequestPrincipal } from "@/lib/auth/request-auth";
import { assertSessionAccess } from "@/lib/auth/session-access";
import { ensureStateDirectory, userStatePath } from "@/lib/auth/user-state";

export const dynamic = "force-dynamic";

interface TagsFile {
  // Map of sessionId -> array of tag strings (lowercased, deduped)
  tags: Record<string, string[]>;
}

function getTagsPath(principal: RequestPrincipal): string {
  return userStatePath(principal, join(getAgentDir(), "tags.json"), "tags.json");
}

function readTags(principal: RequestPrincipal): TagsFile {
  const path = getTagsPath(principal);
  if (!existsSync(path)) return { tags: {} };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<TagsFile>;
    const tags: Record<string, string[]> = {};
    if (raw.tags && typeof raw.tags === "object") {
      for (const [k, v] of Object.entries(raw.tags)) {
        if (Array.isArray(v)) {
          tags[k] = v.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
        }
      }
    }
    return { tags };
  } catch {
    return { tags: {} };
  }
}

function writeTags(principal: RequestPrincipal, data: TagsFile): void {
  const path = getTagsPath(principal);
  ensureStateDirectory(path);
  writeFileSync(path, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
}

function normalizeTag(t: string): string {
  return t.toLowerCase().trim().replace(/^#/, "").slice(0, 32);
}

// GET /api/sessions/tags  → { tags: { sessionId: [tag, ...] } }
export async function GET(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    return NextResponse.json(readTags(principal));
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/sessions/tags  body: { id: string, tag: string } — add tag
export async function POST(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    const body = await req.json() as { id?: unknown; tag?: unknown };
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (typeof body.tag !== "string" || !body.tag.trim()) {
      return NextResponse.json({ error: "tag is required" }, { status: 400 });
    }
    assertSessionAccess(principal, body.id);
    const tag = normalizeTag(body.tag);
    const data = readTags(principal);
    const existing = data.tags[body.id] ?? [];
    if (existing.includes(tag)) {
      return NextResponse.json({ tags: data.tags, unchanged: true });
    }
    data.tags[body.id] = [...existing, tag].slice(0, 16);
    writeTags(principal, data);
    return NextResponse.json({ tags: data.tags });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/sessions/tags  body: { id: string, tag: string } — remove tag
export async function DELETE(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    const body = await req.json() as { id?: unknown; tag?: unknown };
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (typeof body.tag !== "string") {
      return NextResponse.json({ error: "tag is required" }, { status: 400 });
    }
    assertSessionAccess(principal, body.id);
    const tag = normalizeTag(body.tag);
    const data = readTags(principal);
    const existing = data.tags[body.id] ?? [];
    data.tags[body.id] = existing.filter((t) => t !== tag);
    if (data.tags[body.id].length === 0) delete data.tags[body.id];
    writeTags(principal, data);
    return NextResponse.json({ tags: data.tags });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
