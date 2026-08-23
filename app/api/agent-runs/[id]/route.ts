import { AgentContractNotFoundError, getAgentContractService } from "@/lib/agents/agent-contract-service";
import { AuthenticationError, assertRunAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const principal = await authenticateRequest(_request);
    const { id } = await params;
    const service = getAgentContractService();
    const run = service.getRun(id);
    assertRunAccess(principal, run.agentMetadata?.userId);
    return Response.json(service.get(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof AgentContractNotFoundError ? 404 : 500;
    return Response.json({
      error: {
        code: status === 404 ? "RUN_NOT_FOUND" : "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    }, { status });
  }
}
