import { listMeetingRuns } from "@/lib/agents/meeting/meeting-result-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rawLimit = Number.parseInt(new URL(request.url).searchParams.get("limit") ?? "100", 10);
  const limit = Number.isInteger(rawLimit) ? rawLimit : 100;
  return Response.json({ runs: listMeetingRuns(limit) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
