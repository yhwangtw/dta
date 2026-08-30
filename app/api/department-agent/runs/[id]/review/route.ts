import {
  DepartmentReviewConflictError,
  DepartmentReviewValidationError,
  DepartmentRunNotFoundError,
  readDepartmentRun,
  reviewDepartmentRun,
} from "@/lib/agents/department/department-result-store";
import type { MeetingReviewDecision } from "@/lib/agents/meeting/meeting-types";
import { AuthenticationError, assertReviewAccess, assertRunAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { recordAuditEvent } from "@/lib/observability/audit-log";

const DECISIONS = new Set<MeetingReviewDecision>(["approved", "changes_requested", "rejected"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  try {
    const principal = await authenticateRequest(request);
    assertReviewAccess(principal);
    const body = await request.json() as { decision?: unknown; comment?: unknown };
    if (typeof body?.decision !== "string" || !DECISIONS.has(body.decision as MeetingReviewDecision)) {
      return Response.json({ error: "decision must be approved, changes_requested, or rejected" }, { status: 400 });
    }
    if (body.comment !== undefined && typeof body.comment !== "string") return Response.json({ error: "comment must be a string" }, { status: 400 });
    const { id } = await params;
    const current = readDepartmentRun(id);
    if (!current) throw new DepartmentRunNotFoundError("Department Agent run not found");
    assertRunAccess(principal, current.userId);
    const departmentRun = reviewDepartmentRun({
      runId: id,
      decision: body.decision as MeetingReviewDecision,
      actorId: principal.id,
      ...(typeof body.comment === "string" ? { comment: body.comment } : {}),
    });
    recordAuditEvent({ action: `department.review.${body.decision}`, actorId: principal.id, resourceType: "department_run", resourceId: id, outcome: "success", metadata: { agentId: departmentRun.agentId, revision: departmentRun.revision } });
    return Response.json({ departmentRun });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof DepartmentRunNotFoundError ? 404 : error instanceof DepartmentReviewConflictError ? 409 : error instanceof DepartmentReviewValidationError || error instanceof SyntaxError ? 400 : 500;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
