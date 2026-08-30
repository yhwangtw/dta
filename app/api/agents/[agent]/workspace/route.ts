import { getAgentRegistry, AgentRegistryError } from "@/lib/agents/agent-registry";
import { ensureManagedDepartmentWorkspace } from "@/lib/agents/department-workspace";
import { AuthenticationError, assertAgentAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ agent: string }> }): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    const { agent } = await context.params;
    const definition = getAgentRegistry().require(agent);
    assertAgentAccess(principal, definition.allowedRoles);
    if (definition.agentType !== "department") {
      return Response.json({ error: "This workspace endpoint is only for manifest-mounted department Agents" }, { status: 409 });
    }
    const workspace = await ensureManagedDepartmentWorkspace(definition.id, definition.displayName);
    return Response.json({ workspace }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    if (error instanceof AgentRegistryError) return Response.json({ error: error.message }, { status: 404 });
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
