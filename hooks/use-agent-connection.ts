"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { AgentEvent, AgentPhase } from "./use-agent-session-types";

/**
 * SSE wiring for a live agent run: owns the EventSource, the
 * last-event timestamp, and reconnect-with-backoff. Events are delivered
 * through `handleAgentEventRef` so the handler can close over fresh state
 * without re-creating the connection.
 */
export function useAgentEvents(
  agentRunningRef: React.RefObject<boolean>,
  handleAgentEventRef: React.RefObject<((event: AgentEvent) => void) | null>,
) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const [mountedAt] = useState(() => Date.now());
  const lastEventAtRef = useRef(mountedAt);
  const reconnectAttemptRef = useRef(0);

  // Resolves `true` once the stream to `sid` is open, `false` when it isn't
  // yet (failsafe timeout / connect error) — a broken stream never blocks the
  // caller, but it can tell the difference and log it.
  const connectEvents = useCallback((sid: string): Promise<boolean> => {
    const url = `/api/agent/${encodeURIComponent(sid)}/events`;
    const current = eventSourceRef.current;
    // Already connected (or connecting) to this session — reuse instead of
    // tearing down (a recreate right before a prompt POST could drop the
    // run's first events).
    if (current && current.url.endsWith(url)) {
      if (current.readyState === EventSource.OPEN) return Promise.resolve(true);
      if (current.readyState === EventSource.CONNECTING) {
        return new Promise<boolean>((resolve) => {
          let settled = false;
          const settle = (ok: boolean) => { if (!settled) { settled = true; clearTimeout(failSafe); resolve(ok); } };
          const failSafe = setTimeout(() => settle(false), 1_500);
          current.addEventListener("open", () => settle(true), { once: true });
          current.addEventListener("error", () => settle(false), { once: true });
        });
      }
    }
    if (current) {
      current.close();
      eventSourceRef.current = null;
    }
    const es = new EventSource(url);
    eventSourceRef.current = es;
    // Resolves when the stream is open, so callers can await the connection
    // BEFORE prompting — otherwise the run's first events race the subscribe.
    // A safety-net timeout keeps a broken stream from ever blocking a send.
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
      const failSafe = setTimeout(() => settle(false), 1_500);
      es.onopen = () => {
        reconnectAttemptRef.current = 0;
        clearTimeout(failSafe);
        settle(true);
      };
      es.onmessage = (e) => {
        lastEventAtRef.current = Date.now();
        try {
          const event = JSON.parse(e.data) as AgentEvent;
          handleAgentEventRef.current?.(event);
        } catch {
          // ignore
        }
      };
      es.onerror = () => {
        settle(false); // no-op after open — only fails a still-pending await
        if (eventSourceRef.current === es && agentRunningRef.current) {
          es.close();
          eventSourceRef.current = null;
          // Exponential backoff: 1s, 2s, 4s, ... capped at 15s, so a downed
          // server isn't hammered once per second.
          const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 15_000);
          reconnectAttemptRef.current++;
          setTimeout(() => {
            if (agentRunningRef.current) void connectEvents(sid);
          }, delay);
        }
      };
    });
  }, [agentRunningRef, handleAgentEventRef]);

  return { eventSourceRef, lastEventAtRef, connectEvents };
}

/**
 * Stall watchdog: while a run is active, warn when no SSE event has
 * arrived for a while. Heartbeat comments don't fire onmessage, so this
 * measures real progress. Tool runs are legitimately quiet for longer,
 * hence the higher threshold there.
 */
export function useStallWatchdog(
  agentRunning: boolean,
  agentPhaseRef: React.RefObject<AgentPhase>,
  lastEventAtRef: React.RefObject<number>,
) {
  // Seconds since the last SSE event while a run is active; 0 = healthy.
  const [stalledSecs, setStalledSecs] = useState(0);

  useEffect(() => {
    if (!agentRunning) {
      setStalledSecs(0);
      return;
    }
    const id = setInterval(() => {
      const idle = Math.floor((Date.now() - lastEventAtRef.current) / 1000);
      const threshold = agentPhaseRef.current?.kind === "running_tools" ? 120 : 60;
      setStalledSecs(idle >= threshold ? idle : 0);
    }, 5000);
    return () => clearInterval(id);
  }, [agentRunning, agentPhaseRef, lastEventAtRef]);

  return { stalledSecs, setStalledSecs };
}
