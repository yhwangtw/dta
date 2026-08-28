import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { enforceAdminRequest } from "@/lib/auth/session-access";

export const dynamic = "force-dynamic";

function getModelsPath(): string {
  return join(getAgentDir(), "models.json");
}

function readModelsJson(): Record<string, unknown> {
  const path = getModelsPath();
  if (!existsSync(path)) return { providers: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return { providers: {} };
  }
}

function writeModelsJson(data: Record<string, unknown>): void {
  const path = getModelsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

export async function GET(req: Request) {
  const denied = await enforceAdminRequest(req);
  if (denied) return denied;
  return NextResponse.json(readModelsJson());
}

export async function PUT(req: Request) {
  const denied = await enforceAdminRequest(req);
  if (denied) return denied;
  try {
    const body = await req.json() as Record<string, unknown>;
    writeModelsJson(body);
    // Active session runtimes reload models.json before the next /api/models response.
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
