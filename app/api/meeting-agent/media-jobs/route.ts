import { listMeetingMediaJobs } from "@/lib/agents/meeting/meeting-media-job-store";
import { AuthenticationError, assertRunAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    const jobs = listMeetingMediaJobs().filter((job) => {
      try { assertRunAccess(principal, job.userId); return true; }
      catch { return false; }
    });
    return Response.json({ jobs }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
