import {
  AuthenticationError,
  assertAgentAccess,
  assertReviewAccess,
  assertRunAccess,
  authenticateRequest,
  authenticationErrorResponse,
} from "@/lib/auth/request-auth";
import { getAgentRegistry } from "@/lib/agents/agent-registry";
import { WorkflowService, WorkflowServiceError } from "@/lib/integrations/n8n/workflow-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflow: string }> },
): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  try {
    const principal = await authenticateRequest(request);
    assertReviewAccess(principal);
    const body = await request.json() as { agentId?: unknown; sourceRunId?: unknown; reason?: unknown };
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "JSON object is required" }, { status: 400 });
    }
    if (typeof body.agentId !== "string" || !body.agentId.trim()) {
      return Response.json({ error: "agentId is required" }, { status: 400 });
    }
    if (typeof body.sourceRunId !== "string" || !body.sourceRunId.trim()) {
      return Response.json({ error: "sourceRunId is required" }, { status: 400 });
    }
    assertAgentAccess(principal, getAgentRegistry().require(body.agentId.trim()).allowedRoles);
    if (body.reason !== undefined && typeof body.reason !== "string") {
      return Response.json({ error: "reason must be a string" }, { status: 400 });
    }
    const { workflow } = await params;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(workflow)) {
      return Response.json({ error: "Invalid workflow id" }, { status: 400 });
    }
    const service = new WorkflowService();
    const catalog = service.catalog(body.agentId.trim(), body.sourceRunId.trim());
    if (catalog.source) assertRunAccess(principal, catalog.source.userId);
    const result = await service.execute({
      workflowId: workflow,
      agentId: body.agentId.trim(),
      sourceRunId: body.sourceRunId.trim(),
      actorId: principal.id,
      reason: typeof body.reason === "string" && body.reason.trim()
        ? body.reason
        : "Explicitly executed from the DTA result control plane.",
      ...(request.headers.get("idempotency-key")?.trim()
        ? { idempotencyKey: request.headers.get("idempotency-key")!.trim() }
        : {}),
    });
    return Response.json(result, {
      status: result.replayed ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof WorkflowServiceError ? error.status
      : error instanceof SyntaxError ? 400 : 500;
    return Response.json({
      error: {
        code: error instanceof WorkflowServiceError ? error.code : "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    }, { status });
  }
}
