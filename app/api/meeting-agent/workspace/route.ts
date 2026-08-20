import { ensureManagedMeetingWorkspace } from "@/lib/agents/meeting/meeting-workspace";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  try {
    const workspace = await ensureManagedMeetingWorkspace();
    return Response.json({ workspace }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
