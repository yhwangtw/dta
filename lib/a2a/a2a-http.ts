import type { AgentRun } from "@/lib/agent-run-types";
import { getAgentContractService } from "@/lib/agents/agent-contract-service";
import { getAgentEventBus, type AgentEventEnvelope } from "@/lib/agents/agent-event-bus";
import { AuthenticationError, RateLimitError } from "@/lib/auth/request-auth";
import { eventToA2AStream, runToA2ATask } from "./a2a-adapter";
import { beginSseConnection } from "@/lib/observability/runtime-metrics";

export function a2aJson(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/a2a+json; charset=utf-8");
  headers.set("A2A-Version", "1.0");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

const STATUS_NAMES: Record<number, string> = {
  400: "INVALID_ARGUMENT",
  401: "UNAUTHENTICATED",
  403: "PERMISSION_DENIED",
  404: "NOT_FOUND",
  409: "ALREADY_EXISTS",
  429: "RESOURCE_EXHAUSTED",
  500: "INTERNAL",
  501: "UNIMPLEMENTED",
  503: "UNAVAILABLE",
};

const FAILED_PRECONDITION_REASONS = new Set([
  "TASK_NOT_CANCELABLE",
  "PUSH_NOTIFICATION_NOT_SUPPORTED",
  "UNSUPPORTED_OPERATION",
  "EXTENDED_AGENT_CARD_NOT_CONFIGURED",
  "EXTENSION_SUPPORT_REQUIRED",
  "VERSION_NOT_SUPPORTED",
]);

function errorReason(type: string): string {
  return type.replace(/-error$/i, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toUpperCase();
}

export function a2aProblem(
  status: number,
  _title: string,
  detail: string,
  type = "invalid-request",
  options: { headers?: HeadersInit; metadata?: Record<string, string> } = {},
): Response {
  const reason = errorReason(type);
  return a2aJson({
    error: {
      code: status,
      status: FAILED_PRECONDITION_REASONS.has(reason) ? "FAILED_PRECONDITION" : (STATUS_NAMES[status] ?? "UNKNOWN"),
      message: detail,
      details: [{
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason,
        domain: "a2a-protocol.org",
        ...(options.metadata ? { metadata: options.metadata } : {}),
      }],
    },
  }, { status, headers: options.headers });
}

export function a2aAuthenticationError(error: AuthenticationError): Response {
  const headers = new Headers();
  if (error.status === 401) headers.set("WWW-Authenticate", "Bearer");
  if (error instanceof RateLimitError) headers.set("Retry-After", String(error.retryAfterSeconds));
  const reason = error.code === "RUN_NOT_FOUND" ? "task-not-found" : error.code;
  return a2aProblem(error.status, "Authentication Error", error.message, reason, { headers });
}

export function validateA2AVersion(request: Request): Response | null {
  const header = request.headers.get("a2a-version");
  const query = new URL(request.url).searchParams.get("A2A-Version")
    ?? new URL(request.url).searchParams.get("a2a-version");
  const requested = header !== null
    ? (header.trim() || "0.3")
    : query !== null
      ? (query.trim() || "0.3")
      : "0.3";
  return requested === "1.0"
    ? null
    : a2aProblem(
      400,
      "Protocol Version Not Supported",
      `The requested A2A protocol version ${requested} is not supported by this agent`,
      "version-not-supported",
      { metadata: { requestedVersion: requested, supportedVersions: "1.0" } },
    );
}

export function createA2ATaskStream(request: Request, initialRun: AgentRun): Response {
  const encoder = new TextEncoder();
  const bus = getAgentEventBus();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const endMetric = beginSseConnection("a2a", false);
      let closed = false;
      let unsubscribe = () => {};
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let ready = false;
      let highestSequence = 0;
      const pending: AgentEventEnvelope[] = [];
      const send = (value: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        endMetric();
        try { controller.close(); } catch { /* already closed */ }
      };
      const emit = (envelope: AgentEventEnvelope) => {
        if (envelope.sequence <= highestSequence || closed) return;
        highestSequence = envelope.sequence;
        try {
          const run = getAgentContractService().getRun(initialRun.id);
          send(eventToA2AStream(run, envelope.event));
          if (envelope.event.type === "completed" || envelope.event.type === "failed") queueMicrotask(cleanup);
        } catch {
          send({ statusUpdate: { taskId: initialRun.id, contextId: initialRun.agentMetadata?.conversationId ?? initialRun.id, status: { state: "TASK_STATE_FAILED", timestamp: new Date().toISOString() } } });
          queueMicrotask(cleanup);
        }
      };

      send({ task: runToA2ATask(initialRun) });
      if (["completed", "failed", "cancelled", "interrupted"].includes(initialRun.status)) {
        queueMicrotask(cleanup);
        return;
      }

      unsubscribe = bus.subscribe(initialRun.id, (envelope) => {
        if (!ready) {
          pending.push(envelope);
          return;
        }
        emit(envelope);
      });
      const history = bus.history(initialRun.id);
      ready = true;
      for (const envelope of [...history, ...pending].sort((left, right) => left.sequence - right.sequence)) {
        emit(envelope);
      }
      heartbeat = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n")); }, 15_000);
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
      "A2A-Version": "1.0",
    },
  });
}
