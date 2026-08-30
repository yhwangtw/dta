import { ensureMeetingMediaJobRunner } from "@/lib/agents/meeting/meeting-media-job-runner";
import { readMeetingMediaJob } from "@/lib/agents/meeting/meeting-media-job-store";
import { AuthenticationError, assertRunAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export const dynamic = "force-dynamic";

async function ownedJob(request: Request, id: string) {
  const principal = await authenticateRequest(request);
  const job = readMeetingMediaJob(id);
  if (!job) throw new AuthenticationError("Meeting media job not found", 404, "MEDIA_JOB_NOT_FOUND");
  assertRunAccess(principal, job.userId);
  return { principal, job };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const { job } = await ownedJob(request, id);
    return Response.json({ job }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  try {
    const { id } = await params;
    const { principal } = await ownedJob(request, id);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "JSON object is required" }, { status: 400 });
    const job = ensureMeetingMediaJobRunner().retry(id);
    recordAuditEvent({ action: "meeting.media.retry", actorId: principal.id, resourceType: "meeting_media_job", resourceId: id, outcome: "success", metadata: { attempt: job.attempts + 1 } });
    return Response.json({ job }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: /not found/i.test(message) ? 404 : 409 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const { principal } = await ownedJob(request, id);
    const job = ensureMeetingMediaJobRunner().cancel(id);
    recordAuditEvent({ action: "meeting.media.cancel", actorId: principal.id, resourceType: "meeting_media_job", resourceId: id, outcome: "success" });
    return Response.json({ job }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: /not found/i.test(message) ? 404 : 409 });
  }
}
