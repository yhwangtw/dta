import { SessionManager } from "@earendil-works/pi-coding-agent";
import { cacheSessionPath, resolveSessionPath } from "@/lib/session-reader";
import { authorizeSessionRequest } from "@/lib/auth/session-access";
import { AuthenticationError, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { writeAgentSessionMetadata } from "@/lib/agent-metadata-store";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const { principal, metadata } = await authorizeSessionRequest(request, id);
    const sourcePath = await resolveSessionPath(id);
    if (!sourcePath) return Response.json({ error: "Session not found" }, { status: 404 });
    const source = SessionManager.open(sourcePath);
    const leafId = source.getLeafId();
    if (!leafId) return Response.json({ error: "Cannot clone an empty session" }, { status: 409 });
    const sessionFile = source.createBranchedSession(leafId);
    if (!sessionFile) return Response.json({ error: "Session persistence is unavailable" }, { status: 409 });
    const clone = SessionManager.open(sessionFile);
    const sessionId = clone.getSessionId();
    cacheSessionPath(sessionId, sessionFile);
    if (metadata) writeAgentSessionMetadata(sessionId, { ...metadata, runId: undefined });
    recordAuditEvent({
      action: "session.clone",
      actorId: principal.id,
      resourceType: "agent_session",
      resourceId: sessionId,
      outcome: "success",
      metadata: { sourceSessionId: id, actingUserId: metadata?.userId ?? principal.id },
    });
    return Response.json({ sessionId, sessionFile, cwd: clone.getCwd() }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
