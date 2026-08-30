import { listPMRuns } from "@/lib/agents/pm/pm-result-store";
import { AuthenticationError, assertRunAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    const raw = Number.parseInt(new URL(request.url).searchParams.get("limit") ?? "100", 10);
    const limit = Number.isInteger(raw) ? Math.max(1, Math.min(raw, 500)) : 100;
    const runs = listPMRuns(Math.min(500, limit * 5)).filter((run) => {
      try { assertRunAccess(principal, run.userId); return true; }
      catch { return false; }
    }).slice(0, limit);
    return Response.json({ runs }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
