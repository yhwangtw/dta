import { ensureManagedMeetingWorkspace } from "@/lib/agents/meeting/meeting-workspace";
import { AuthenticationError, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    await authenticateRequest(request);
    const workspace = await ensureManagedMeetingWorkspace();
    return Response.json({ workspace }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
