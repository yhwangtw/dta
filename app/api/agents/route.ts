import { getAgentRegistry } from "@/lib/agents/agent-registry";
import { AuthenticationError, authenticateRequest, authenticationErrorResponse, canAccessAgent } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    const agents = getAgentRegistry().list()
      .filter((agent) => canAccessAgent(principal, agent.allowedRoles))
      .map((agent) => ({
      id: agent.id,
      agentType: agent.agentType,
      displayName: agent.displayName,
      description: agent.description,
      internal: agent.internal,
      enabledByDefault: agent.enabledByDefault,
      skills: agent.skills,
      reviewPolicy: agent.reviewPolicy,
      artifactTypes: agent.artifactTypes,
    }));
    return Response.json({ agents }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    throw error;
  }
}
