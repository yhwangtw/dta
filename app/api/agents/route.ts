import { getAgentRegistry } from "@/lib/agents/agent-registry";
import { AuthenticationError, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await authenticateRequest(request);
    const agents = getAgentRegistry().list().map((agent) => ({
      id: agent.id,
      agentType: agent.agentType,
      displayName: agent.displayName,
      description: agent.description,
      internal: agent.internal,
      enabledByDefault: agent.enabledByDefault,
      skills: agent.skills,
    }));
    return Response.json({ agents }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    throw error;
  }
}
