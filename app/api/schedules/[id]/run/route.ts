import { ensureScheduleRunner, ScheduleConflictError, ScheduleNotFoundError } from "@/lib/schedule-runner";
import { readScheduleStore } from "@/lib/schedule-store";
import { assertCodingAccess, assertRunAccess, authenticateRequest, AuthenticationError, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const { id } = await params;
  try {
    const principal = await authenticateRequest(req);
    assertCodingAccess(principal);
    // Consume and validate the JSON envelope even though Run now currently has
    // no options. This keeps local state-changing endpoints CSRF-resistant.
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "JSON object is required" }, { status: 400 });
    }
    const schedule = readScheduleStore().schedules.find((item) => item.id === id);
    if (!schedule) return Response.json({ error: "Schedule not found" }, { status: 404 });
    assertRunAccess(principal, schedule.ownerId);
    const run = ensureScheduleRunner().runNow(id);
    recordAuditEvent({ action: "schedule.run", actorId: principal.id, resourceType: "schedule_run", resourceId: run.id, outcome: "success", metadata: { scheduleId: id, actingUserId: schedule.ownerId ?? principal.id } });
    return Response.json({ run }, { status: 202 });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof ScheduleNotFoundError ? 404
      : error instanceof ScheduleConflictError ? 409
        : error instanceof SyntaxError ? 400 : 500;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
