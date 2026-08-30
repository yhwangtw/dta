import { AgentContractNotFoundError, getAgentContractService } from "@/lib/agents/agent-contract-service";
import { getAgentEventBus, type AgentEventEnvelope } from "@/lib/agents/agent-event-bus";
import type { GenericAgentEvent } from "@/lib/agents/agent-types";
import { AuthenticationError, assertRunAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { beginSseConnection } from "@/lib/observability/runtime-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function snapshotEvent(status: string, runId: string, result?: unknown, error?: string): GenericAgentEvent {
  if (status === "completed") return { type: "completed", result: result ?? null };
  if (status === "failed") return { type: "failed", error: error || "Agent run failed" };
  if (status === "waiting_for_input") return { type: "waiting_for_input", prompt: "The agent is waiting for input" };
  return { type: "status", message: `Agent run ${runId} is in progress`, state: "running" };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  let snapshot;
  try {
    const principal = await authenticateRequest(request);
    const service = getAgentContractService();
    const run = service.getRun(id);
    assertRunAccess(principal, run.agentMetadata?.userId);
    snapshot = service.get(id);
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof AgentContractNotFoundError ? 404 : 500;
    return Response.json({ error: { code: status === 404 ? "RUN_NOT_FOUND" : "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } }, { status });
  }

  const parsedLastEventId = Number.parseInt(request.headers.get("last-event-id") ?? "0", 10);
  const afterSequence = Number.isInteger(parsedLastEventId) && parsedLastEventId >= 0 ? parsedLastEventId : 0;
  const encoder = new TextEncoder();
  const eventBus = getAgentEventBus();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const endMetric = beginSseConnection("agent_run", afterSequence > 0);
      let closed = false;
      let unsubscribe = () => {};
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let ready = false;
      let highestSequence = afterSequence;
      const pending: AgentEventEnvelope[] = [];

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        endMetric();
        try { controller.close(); } catch { /* stream already closed */ }
      };
      const send = (envelope: AgentEventEnvelope) => {
        if (closed || envelope.sequence <= highestSequence) return;
        highestSequence = envelope.sequence;
        const payload = { ...envelope.event, sequence: envelope.sequence, occurredAt: envelope.occurredAt };
        controller.enqueue(encoder.encode(`id: ${envelope.sequence}\nevent: ${envelope.event.type}\ndata: ${JSON.stringify(payload)}\n\n`));
        if (envelope.event.type === "completed" || envelope.event.type === "failed") queueMicrotask(cleanup);
      };

      unsubscribe = eventBus.subscribe(id, (envelope) => {
        if (!ready) pending.push(envelope);
        else send(envelope);
      });
      const history = eventBus.history(id, afterSequence);
      ready = true;
      for (const envelope of [...history, ...pending].sort((left, right) => left.sequence - right.sequence)) send(envelope);

      if (history.length === 0 && pending.length === 0) {
        const event = snapshotEvent(snapshot.status, id, snapshot.result, snapshot.error?.message);
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify({ ...event, occurredAt: new Date().toISOString() })}\n\n`));
        if (event.type === "completed" || event.type === "failed") {
          queueMicrotask(cleanup);
          return;
        }
      }

      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 15_000);
      heartbeat.unref?.();
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
