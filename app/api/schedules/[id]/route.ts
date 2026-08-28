import { ACTIVE_SCHEDULE_RUN_STATUSES } from "@/lib/schedule-types";
import { ensureScheduleRunner } from "@/lib/schedule-runner";
import { mutateScheduleStore, readScheduleStore } from "@/lib/schedule-store";
import { initialNextRunAt, ScheduleValidationError, validateScheduleInput } from "@/lib/schedule-validation";
import { assertCodingAccess, assertRunAccess, authenticateRequest, AuthenticationError, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export const dynamic = "force-dynamic";

function requiresJson(req: Request): Response | null {
  return req.headers.get("content-type")?.toLowerCase().startsWith("application/json")
    ? null
    : Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const invalidType = requiresJson(req);
  if (invalidType) return invalidType;
  const { id } = await params;
  try {
    const principal = await authenticateRequest(req);
    assertCodingAccess(principal);
    const current = readScheduleStore().schedules.find((schedule) => schedule.id === id);
    if (!current) return Response.json({ error: "Schedule not found" }, { status: 404 });
    assertRunAccess(principal, current.ownerId);
    const body = await req.json() as Record<string, unknown>;
    const input = await validateScheduleInput({ ...current, ...body, timing: body.timing ?? current.timing });
    const now = new Date();
    const nextRunAt = initialNextRunAt(input, now);
    const updated = mutateScheduleStore((store) => {
      const index = store.schedules.findIndex((schedule) => schedule.id === id);
      if (index < 0) return null;
      const schedule = {
        ...store.schedules[index],
        ...input,
        enabled: input.enabled ?? true,
        missedRunPolicy: input.missedRunPolicy ?? "run_once",
        toolNames: input.toolNames ?? [],
        id,
        ownerId: store.schedules[index].ownerId ?? principal.id,
        createdAt: store.schedules[index].createdAt,
        updatedAt: now.toISOString(),
        nextRunAt,
      };
      store.schedules[index] = schedule;
      return schedule;
    });
    if (!updated) return Response.json({ error: "Schedule not found" }, { status: 404 });
    ensureScheduleRunner().reschedule();
    recordAuditEvent({ action: "schedule.update", actorId: principal.id, resourceType: "schedule", resourceId: id, outcome: "success", metadata: { actingUserId: updated.ownerId ?? principal.id } });
    return Response.json({ schedule: updated });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof ScheduleValidationError || error instanceof SyntaxError ? 400 : 500;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const invalidType = requiresJson(req);
  if (invalidType) return invalidType;
  const { id } = await params;
  try {
    const principal = await authenticateRequest(req);
    assertCodingAccess(principal);
    const current = readScheduleStore().schedules.find((schedule) => schedule.id === id);
    if (!current) return Response.json({ error: "Schedule not found" }, { status: 404 });
    assertRunAccess(principal, current.ownerId);
    const result = mutateScheduleStore((store) => {
      const index = store.schedules.findIndex((schedule) => schedule.id === id);
      if (index < 0) return "missing" as const;
      if (store.runs.some((run) => run.scheduleId === id && ACTIVE_SCHEDULE_RUN_STATUSES.has(run.status))) return "active" as const;
      store.schedules.splice(index, 1);
      return "deleted" as const;
    });
    if (result === "missing") return Response.json({ error: "Schedule not found" }, { status: 404 });
    if (result === "active") return Response.json({ error: "Wait for the active run to finish" }, { status: 409 });
    ensureScheduleRunner().reschedule();
    recordAuditEvent({ action: "schedule.delete", actorId: principal.id, resourceType: "schedule", resourceId: id, outcome: "success", metadata: { actingUserId: current.ownerId ?? principal.id } });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
