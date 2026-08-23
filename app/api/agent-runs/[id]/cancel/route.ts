import {
  AgentRunNotFoundError,
  ensureAgentRunSupervisor,
} from "@/lib/agent-run-supervisor";
import { readAgentRunStore } from "@/lib/agent-run-store";
import { AuthenticationError, assertRunAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  try {
    const principal = await authenticateRequest(req);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "JSON object is required" }, { status: 400 });
    }
    const { id } = await params;
    const existing = readAgentRunStore().runs.find((candidate) => candidate.id === id);
    if (!existing) throw new AgentRunNotFoundError("Agent run not found");
    assertRunAccess(principal, existing.agentMetadata?.userId);
    const run = await ensureAgentRunSupervisor().cancel(id);
    return Response.json({ run });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof AgentRunNotFoundError
      ? 404
      : error instanceof SyntaxError ? 400 : 500;
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status });
  }
}
