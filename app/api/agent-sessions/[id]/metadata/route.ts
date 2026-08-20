import { codingAgentMetadata } from "@/lib/agents/agent-types";
import { readAgentSessionMetadata } from "@/lib/agent-metadata-store";
import { readMeetingRun } from "@/lib/agents/meeting/meeting-result-store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const metadata = readAgentSessionMetadata(id) ?? codingAgentMetadata();
  const meetingRun = metadata.agentType === "meeting" && metadata.runId
    ? readMeetingRun(metadata.runId)
    : null;
  return Response.json({ metadata, meetingRun }, {
    headers: { "Cache-Control": "no-store" },
  });
}
