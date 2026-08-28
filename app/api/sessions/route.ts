import { NextResponse } from "next/server";
import { listAllSessions } from "@/lib/session-reader";
import { authenticateRequest, AuthenticationError, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { accessibleSessionIds } from "@/lib/auth/session-access";

export async function GET(request: Request) {
  try {
    const principal = await authenticateRequest(request);
    const allowed = accessibleSessionIds(principal);
    const sessions = (await listAllSessions()).filter((session) => !allowed || allowed.has(session.id));
    return NextResponse.json({ sessions });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
