import { codingAgentMetadata } from "@/lib/agents/agent-types";
import { readAgentSessionMetadata } from "@/lib/agent-metadata-store";
import { readMeetingRun } from "@/lib/agents/meeting/meeting-result-store";
import { readPMRun } from "@/lib/agents/pm/pm-result-store";
import { AuthenticationError, assertRunAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    const { id } = await params;
    const metadata = readAgentSessionMetadata(id) ?? codingAgentMetadata();
    assertRunAccess(principal, metadata.userId);
    const meetingRun = metadata.agentType === "meeting" && metadata.runId
      ? readMeetingRun(metadata.runId)
      : null;
    const pmRun = metadata.agentType === "pm" && metadata.runId
      ? readPMRun(metadata.runId)
      : null;
    return Response.json({ metadata, meetingRun, pmRun }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
