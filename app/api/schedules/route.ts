import { randomUUID } from "node:crypto";
import { ensureScheduleRunner } from "@/lib/schedule-runner";
import { mutateScheduleStore, readScheduleStore } from "@/lib/schedule-store";
import type { AgentSchedule } from "@/lib/schedule-types";
import { initialNextRunAt, ScheduleValidationError, validateScheduleInput } from "@/lib/schedule-validation";
import { assertCodingAccess, assertRunAccess, authenticateRequest, AuthenticationError, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export const dynamic = "force-dynamic";

function requiresJson(req: Request): Response | null {
  return req.headers.get("content-type")?.toLowerCase().startsWith("application/json")
    ? null
    : Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
}

export async function GET(req: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(req);
    assertCodingAccess(principal);
    const runner = ensureScheduleRunner();
    const store = readScheduleStore();
    const owned = <T extends { ownerId?: string }>(items: T[]) => items.filter((item) => {
      try { assertRunAccess(principal, item.ownerId); return true; } catch { return false; }
    });
    const schedules = owned(store.schedules);
    const runs = owned(store.runs);
    const runnerHealth = runner.getHealth();
    const health = principal.authType === "local" || principal.roles.includes("dta-admin")
      ? runnerHealth
      : {
          ...runnerHealth,
          state: schedules.some((schedule) => schedule.enabled && schedule.nextRunAt) ? "healthy" as const : "idle" as const,
          nextWakeAt: schedules
            .filter((schedule) => schedule.enabled && schedule.nextRunAt)
            .map((schedule) => schedule.nextRunAt as string)
            .sort()[0] ?? null,
          tickCount: 0,
          missedRuns: runs.filter((run) => run.status === "skipped").length,
        };
    return Response.json({ ...store, schedules, runs, serverTime: new Date().toISOString(), health }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const invalidType = requiresJson(req);
  if (invalidType) return invalidType;
  try {
    const principal = await authenticateRequest(req);
    assertCodingAccess(principal);
    const input = await validateScheduleInput(await req.json());
    const now = new Date();
    const schedule: AgentSchedule = {
      ...input,
      ownerId: principal.id,
      enabled: input.enabled ?? true,
      missedRunPolicy: input.missedRunPolicy ?? "run_once",
      toolNames: input.toolNames ?? [],
      id: randomUUID(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextRunAt: initialNextRunAt(input, now),
    };
    mutateScheduleStore((store) => {
      if (store.schedules.length >= 200) throw new ScheduleValidationError("Schedule limit reached");
      store.schedules.push(schedule);
    });
    ensureScheduleRunner().reschedule();
    recordAuditEvent({ action: "schedule.create", actorId: principal.id, resourceType: "schedule", resourceId: schedule.id, outcome: "success", metadata: { actingUserId: principal.id } });
    return Response.json({ schedule }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof ScheduleValidationError || error instanceof SyntaxError ? 400 : 500;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
