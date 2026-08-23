import { buildA2AAgentCard } from "@/lib/a2a/agent-card";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(buildA2AAgentCard(), {
    headers: { "Cache-Control": "public, max-age=300", "Content-Type": "application/json; charset=utf-8" },
  });
}
