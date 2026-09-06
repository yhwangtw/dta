import { NextResponse } from "next/server";
import { getRuntimeStatus } from "@/lib/runtime-status";
import { enforceAdminRequest } from "@/lib/auth/session-access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await enforceAdminRequest(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await getRuntimeStatus());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
