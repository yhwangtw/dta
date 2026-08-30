import { AgentRequestValidationError, parseAgentRequest } from "@/lib/agents/agent-contract";
import { AgentContractConfigurationError, AgentContractInputError, AgentContractNotFoundError, getAgentContractService } from "@/lib/agents/agent-contract-service";
import { AgentRegistryError } from "@/lib/agents/agent-registry";
import { AuthenticationError, assertAgentAccess, assertRateLimit, authenticateRequest, authenticationErrorResponse, resolveActingUserId } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agent: string }> },
): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json" } }, { status: 415 });
  }
  try {
    const principal = await authenticateRequest(request);
    assertRateLimit(principal, "agent");
    const parsed = parseAgentRequest(await request.json());
    const input = { ...parsed, userId: resolveActingUserId(principal, parsed.userId) };
    const { agent } = await params;
    const service = getAgentContractService();
    const definition = service.definition(agent);
    assertAgentAccess(principal, definition.allowedRoles);
    const response = await service.submit(agent, input);
    return Response.json(response, { status: response.status === "completed" ? 200 : 202 });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof AgentRequestValidationError || error instanceof AgentContractInputError || error instanceof SyntaxError ? 400
      : error instanceof AgentContractNotFoundError ? 404
        : error instanceof AgentRegistryError ? 409
          : error instanceof AgentContractConfigurationError ? 503 : 500;
    return Response.json({
      error: {
        code: status === 400 ? "INVALID_REQUEST" : status === 404 ? "AGENT_NOT_FOUND" : status === 409 ? "AGENT_UNAVAILABLE" : status === 503 ? "CONFIGURATION_ERROR" : "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    }, { status });
  }
}
