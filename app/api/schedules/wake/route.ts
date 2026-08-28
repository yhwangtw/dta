import { ensureScheduleRunner } from "@/lib/schedule-runner";
import { assertAdminAccess, authenticateRequest, AuthenticationError, authenticationErrorResponse } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(req);
    assertAdminAccess(principal);
    return Response.json({ health: ensureScheduleRunner().getHealth() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(req);
    assertAdminAccess(principal);
    return Response.json({ health: await ensureScheduleRunner().wake() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
