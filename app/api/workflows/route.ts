import { AuthenticationError, assertAgentAccess, assertRunAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { getAgentRegistry } from "@/lib/agents/agent-registry";
import { WorkflowService, WorkflowServiceError } from "@/lib/integrations/n8n/workflow-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agentId")?.trim();
    const sourceRunId = url.searchParams.get("sourceRunId")?.trim();
    if (!agentId) return Response.json({ error: "agentId is required" }, { status: 400 });
    assertAgentAccess(principal, getAgentRegistry().require(agentId).allowedRoles);
    const catalog = new WorkflowService().catalog(agentId, sourceRunId || undefined);
    if (catalog.source) assertRunAccess(principal, catalog.source.userId);
    const { source: _source, ...response } = catalog;
    return Response.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof WorkflowServiceError ? error.status : 400;
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status });
  }
}
