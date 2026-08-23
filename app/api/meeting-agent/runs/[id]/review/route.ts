import {
  MeetingReviewConflictError,
  MeetingReviewValidationError,
  MeetingRunNotFoundError,
  readMeetingRun,
  reviewMeetingRun,
} from "@/lib/agents/meeting/meeting-result-store";
import type { MeetingReviewDecision } from "@/lib/agents/meeting/meeting-types";
import { AuthenticationError, assertReviewAccess, assertRunAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { readAgentRunStore } from "@/lib/agent-run-store";
import { getMemoryStore } from "@/lib/integrations/memory";
import { conversationMemoryKey } from "@/lib/integrations/memory/memory-key";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export const dynamic = "force-dynamic";

const DECISIONS = new Set<MeetingReviewDecision>(["approved", "changes_requested", "rejected"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  try {
    const principal = await authenticateRequest(request);
    assertReviewAccess(principal);
    const body = await request.json() as { decision?: unknown; comment?: unknown };
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "JSON object is required" }, { status: 400 });
    }
    if (typeof body.decision !== "string" || !DECISIONS.has(body.decision as MeetingReviewDecision)) {
      return Response.json({ error: "decision must be approved, changes_requested, or rejected" }, { status: 400 });
    }
    if (body.comment !== undefined && typeof body.comment !== "string") {
      return Response.json({ error: "comment must be a string" }, { status: 400 });
    }
    const { id } = await params;
    const current = readMeetingRun(id);
    if (!current) throw new MeetingRunNotFoundError("Meeting run not found");
    assertRunAccess(principal, current.userId);
    const meetingRun = reviewMeetingRun({
      runId: id,
      decision: body.decision as MeetingReviewDecision,
      actorId: principal.id,
      ...(typeof body.comment === "string" ? { comment: body.comment } : {}),
    });
    const agentRun = readAgentRunStore().runs.find((candidate) => candidate.id === id);
    const memoryKey = agentRun?.agentMetadata ? conversationMemoryKey(agentRun.agentMetadata) : null;
    if (memoryKey) {
      await getMemoryStore().appendConversationMemory(memoryKey, {
        type: "meeting_review",
        occurredAt: meetingRun.updatedAt,
        runId: id,
        revision: meetingRun.revision,
        decision: body.decision,
        actorId: principal.id,
        ...(typeof body.comment === "string" && body.comment.trim() ? { comment: body.comment.trim() } : {}),
      }).catch(() => {});
    }
    recordAuditEvent({
      action: `meeting.review.${body.decision}`,
      actorId: principal.id,
      resourceType: "meeting_run",
      resourceId: id,
      outcome: "success",
      metadata: { revision: meetingRun.revision },
    });
    return Response.json({ meetingRun });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof MeetingRunNotFoundError ? 404
      : error instanceof MeetingReviewConflictError ? 409
        : error instanceof MeetingReviewValidationError || error instanceof SyntaxError ? 400 : 500;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
