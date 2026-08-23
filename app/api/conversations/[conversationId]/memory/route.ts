import { getMemoryStore } from "@/lib/integrations/memory";
import { AuthenticationError, authenticateRequest, authenticationErrorResponse, resolveActingUserId } from "@/lib/auth/request-auth";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export const runtime = "nodejs";

function bounded(value: string | null, fallback: string, field: string): string {
  const normalized = value?.trim() || fallback;
  if (!normalized || normalized.length > 500) throw new TypeError(`${field} is invalid`);
  return normalized;
}

export async function DELETE(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    const { conversationId: rawConversationId } = await context.params;
    const url = new URL(request.url);
    const conversationId = bounded(rawConversationId, "", "conversationId");
    const projectId = bounded(url.searchParams.get("projectId"), "default", "projectId");
    const userId = resolveActingUserId(principal, url.searchParams.get("userId") ?? undefined);
    await getMemoryStore().deleteConversationMemory([userId, projectId, conversationId].join(":"));
    recordAuditEvent({ action: "memory.delete", actorId: principal.id, resourceType: "conversation", resourceId: conversationId, outcome: "success", metadata: { actingUserId: userId, projectId } });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    if (error instanceof TypeError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Unable to delete conversation memory" }, { status: 500 });
  }
}
