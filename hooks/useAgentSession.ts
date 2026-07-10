"use client";

import { useState, useCallback, useRef, useEffect, useReducer } from "react";
import type { AgentMessage } from "@/lib/types";
import { normalizeToolCalls } from "@/lib/normalize";
import { sendAgentCommand } from "@/lib/agent-client";
import { showToast } from "@/hooks/useToast";
import { translate } from "@/lib/i18n";
import { setIdleTitle, setRunningTitle, setDoneTitle, setErrorTitle, notifyDone, requestNotifyPermission } from "@/lib/attention";
import type { ToolEntry } from "@/components/modals/ToolPanel";
import type { SessionData, AgentEvent, AgentPhase, UseAgentSessionOptions, ThinkingLevelOption, ChatInputHandle, AttachedImage } from "./use-agent-session-types";
import { streamReducer, getRunError, computeSessionStats } from "./use-agent-session-types";
import { useAgentEvents, useStallWatchdog } from "./use-agent-connection";
import { useTranscriptScroll } from "./use-transcript-scroll";
import { useModelCatalog } from "./use-model-catalog";

export type { SessionData, AgentPhase, ThinkingLevelOption, ChatInputHandle, AttachedImage };

export function useAgentSession(opts: UseAgentSessionOptions) {
  const {
    session, newSessionCwd, onAgentEnd, onSessionCreated, onSessionForked,
    modelsRefreshKey, onBranchDataChange, onSystemPromptChange, onSessionNamed,
  } = opts;

  const isNew = session === null && newSessionCwd !== null;

  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [streamState, dispatch] = useReducer(streamReducer, { isStreaming: false, streamingMessage: null });
  const [agentRunning, setAgentRunning] = useState(false);
  const [toolPreset, setToolPreset] = useState<"none" | "default" | "full">("default");
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>("auto");
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; maxAttempts: number; errorMessage?: string } | null>(null);
  const [contextUsage, setContextUsage] = useState<{ percent: number | null; contextWindow: number; tokens: number | null } | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [forkingEntryId, setForkingEntryId] = useState<string | null>(null);
  const [currentModelOverride, setCurrentModelOverride] = useState<{ provider: string; modelId: string } | null>(null);
  const [pendingModel, setPendingModel] = useState<{ provider: string; modelId: string } | null>(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const [compactError, setCompactError] = useState<string | null>(null);
  const [agentPhase, setAgentPhase] = useState<AgentPhase>(null);
  const [agentStartedAt, setAgentStartedAt] = useState<number | null>(null);
  const [queuedFollowUps, setQueuedFollowUps] = useState<string[]>([]);
  const [bashRun, setBashRun] = useState<{ command: string; output: string; running: boolean } | null>(null);
  // Streaming-update throttle (see the message_update case)
  const pendingStreamMsgRef = useRef<AgentMessage | null>(null);
  const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionIdRef = useRef<string | null>(session?.id ?? null);
  const agentRunningRef = useRef(false);
  const agentPhaseRef = useRef<AgentPhase>(null);
  const handleAgentEventRef = useRef<((event: AgentEvent) => void) | null>(null);
  // Already-named sessions never need auto-naming — skip the summarize call
  const hasSummarizedRef = useRef(Boolean(session?.name));
  const sessionNameRef = useRef<string | undefined>(session?.name);

  const { eventSourceRef, lastEventAtRef, connectEvents } = useAgentEvents(agentRunningRef, handleAgentEventRef);
  const { stalledSecs, setStalledSecs } = useStallWatchdog(agentRunning, agentPhaseRef, lastEventAtRef);
  const {
    initialScrollDoneRef, lastUserMsgRef, pendingScrollToUserRef,
    messagesEndRef, scrollContainerRef,
  } = useTranscriptScroll(messages.length, agentRunning, agentRunningRef);
  const {
    modelNames, modelList, modelThinkingLevels, modelThinkingLevelMaps,
    newSessionModel, setNewSessionModel,
  } = useModelCatalog(isNew, modelsRefreshKey, opts.setNewSessionModel);

  const setToolPresetState = opts.setToolPreset ?? setToolPreset;

  const currentModel = currentModelOverride ?? data?.context.model ?? pendingModel ?? null;
  const displayModel = isNew ? newSessionModel : currentModel;

  const sessionStats = computeSessionStats(messages);

  const loadSession = useCallback(async (sid: string, showLoading = false, includeState = false) => {
    try {
      if (showLoading) setLoading(true);
      const url = includeState
        ? `/api/sessions/${encodeURIComponent(sid)}?includeState`
        : `/api/sessions/${encodeURIComponent(sid)}`;
      const res = await fetch(url);
      if (res.status === 404) {
        if (showLoading) {
          setData(null);
          setActiveLeafId(null);
          setMessages([]);
          setError(null);
        }
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as SessionData & { agentState?: { running: boolean; state?: { isStreaming?: boolean; isCompacting?: boolean; contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null } | null; systemPrompt?: string; thinkingLevel?: string } } };
      setData(d);
      const info = (d as { info?: { name?: string } }).info;
      if (info?.name) sessionNameRef.current = info.name;
      setActiveLeafId(d.leafId);
      setMessages(d.context.messages);
      setEntryIds(d.context.entryIds ?? []);
      setCurrentModelOverride(null);
      setError(null);
      // If no live agent state, fall back to thinking level from session file
      if (!d.agentState?.state?.thinkingLevel && d.context.thinkingLevel && d.context.thinkingLevel !== "off") {
        setThinkingLevel(d.context.thinkingLevel as ThinkingLevelOption);
      }
      return d.agentState ?? null;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const loadContext = useCallback(async (sid: string, leafId: string | null) => {
    try {
      const url = leafId
        ? `/api/sessions/${encodeURIComponent(sid)}/context?leafId=${encodeURIComponent(leafId)}`
        : `/api/sessions/${encodeURIComponent(sid)}/context`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { context: { messages: AgentMessage[]; entryIds: string[] } };
      setMessages(d.context.messages);
      setEntryIds(d.context.entryIds ?? []);
    } catch (e) {
      console.error("Failed to load context:", e);
    }
  }, []);

  const loadTools = useCallback(async (sid: string) => {
    try {
      const tools = await sendAgentCommand<ToolEntry[]>(sid, { type: "get_tools" });
      if (tools) {
        const { getPresetFromTools } = await import("@/components/modals/ToolPanel");
        setToolPresetState(getPresetFromTools(tools));
      }
    } catch (e) {
      console.error("Failed to load tools:", e);
    }
  }, [setToolPresetState]);

  useEffect(() => {
    agentRunningRef.current = agentRunning;
  }, [agentRunning]);
  agentPhaseRef.current = agentPhase;

  const handleAgentEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case "agent_start":
        setAgentRunning(true);
        setAgentPhase({ kind: "waiting_model" });
        setAgentStartedAt(Date.now());
        lastEventAtRef.current = Date.now();
        setStalledSecs(0);
        setRunningTitle(sessionNameRef.current);
        dispatch({ type: "start" });
        // Reload so user messages injected mid-stream (steer, queued
        // follow-ups) show up in the transcript from the session file.
        if (sessionIdRef.current) loadSession(sessionIdRef.current);
        break;
      case "agent_end":
        // Cancel any throttled streaming frame (aborted runs may end without
        // a message_end).
        pendingStreamMsgRef.current = null;
        if (streamFlushTimerRef.current != null) {
          clearTimeout(streamFlushTimerRef.current);
          streamFlushTimerRef.current = null;
        }
        setAgentRunning(false);
        setAgentPhase(null);
        setRetryInfo(null);
        setAgentStartedAt(null);
        // Queued follow-ups are consumed right after this event; the next
        // agent_start reload will surface them as real messages.
        setQueuedFollowUps([]);
        setStalledSecs(0);
        {
          const runError = getRunError(event);
          if (runError) {
            showToast(`Model error: ${runError}`, { type: "error", duration: 8000 });
            setErrorTitle(sessionNameRef.current);
            notifyDone(sessionNameRef.current, runError);
          } else {
            setDoneTitle(sessionNameRef.current);
            notifyDone(sessionNameRef.current);
          }
        }
        dispatch({ type: "end" });
        if (sessionIdRef.current) {
          // includeState piggybacks contextUsage/systemPrompt on the session
          // reload — one request instead of two.
          loadSession(sessionIdRef.current, false, true).then((agentState) => {
            if (agentState?.state) {
              if (agentState.state.contextUsage !== undefined) setContextUsage(agentState.state.contextUsage ?? null);
              if (agentState.state.systemPrompt !== undefined) setSystemPrompt(agentState.state.systemPrompt ?? null);
            }
          });
          // Auto-name session after first turn (background, fire-and-forget)
          if (!hasSummarizedRef.current) {
            hasSummarizedRef.current = true;
            fetch(`/api/agent/${encodeURIComponent(sessionIdRef.current)}/summarize`, { method: "POST" })
              .then(() => onSessionNamed?.())
              .catch(() => {});
          }
        }
        onAgentEnd?.();
        break;
      case "message_start":
      case "message_update": {
        const msg = event.message as Partial<AgentMessage> | undefined;
        if (msg?.role === "user") {
          break;
        }
        if (msg) {
          const normalized = normalizeToolCalls(msg as AgentMessage);
          if (event.type === "message_start") {
            dispatch({ type: "update", message: normalized });
          } else {
            // Throttle streaming updates: every chunk re-parses the whole
            // message's markdown (O(length) per token). Batch to ~12
            // frames/sec — the last chunk in each window wins.
            pendingStreamMsgRef.current = normalized;
            if (streamFlushTimerRef.current == null) {
              streamFlushTimerRef.current = setTimeout(() => {
                streamFlushTimerRef.current = null;
                if (pendingStreamMsgRef.current) {
                  dispatch({ type: "update", message: pendingStreamMsgRef.current });
                  pendingStreamMsgRef.current = null;
                }
              }, 80);
            }
          }
        }
        setAgentPhase(null);
        break;
      }
      case "message_end": {
        // Drop any pending throttled frame — the completed message wins, and
        // a late flush after the reset would resurrect the streaming bubble.
        pendingStreamMsgRef.current = null;
        if (streamFlushTimerRef.current != null) {
          clearTimeout(streamFlushTimerRef.current);
          streamFlushTimerRef.current = null;
        }
        const completed = event.message as AgentMessage | undefined;
        if (completed && completed.role !== "user") {
          setMessages((prev) => [...prev, normalizeToolCalls(completed)]);
        }
        dispatch({ type: "reset" });
        setAgentPhase({ kind: "waiting_model" });
        break;
      }
      case "tool_execution_start": {
        const id = event.toolCallId as string;
        const name = event.toolName as string;
        setAgentPhase((prev) => {
          const tools = prev?.kind === "running_tools" ? [...prev.tools] : [];
          if (!tools.some((t) => t.id === id)) tools.push({ id, name });
          return { kind: "running_tools", tools };
        });
        break;
      }
      case "tool_execution_end": {
        const id = event.toolCallId as string;
        setAgentPhase((prev) => {
          if (prev?.kind !== "running_tools") return prev;
          const tools = prev.tools.filter((t) => t.id !== id);
          if (tools.length === 0) return { kind: "waiting_model" };
          return { kind: "running_tools", tools };
        });
        break;
      }
      case "bash_start":
        setBashRun({ command: event.command as string, output: "", running: true });
        break;
      case "bash_chunk":
        setBashRun((prev) => prev ? { ...prev, output: prev.output + (event.chunk as string) } : prev);
        break;
      case "bash_end":
        setBashRun((prev) => prev ? { ...prev, running: false } : prev);
        break;
      case "auto_retry_start":
        setRetryInfo({ attempt: event.attempt as number, maxAttempts: event.maxAttempts as number, errorMessage: event.errorMessage as string | undefined });
        break;
      case "auto_retry_end":
        setRetryInfo(null);
        break;
      case "auto_compaction_start":
      case "compaction_start":
        setIsCompacting(true);
        setCompactError(null);
        break;
      case "auto_compaction_end":
      case "compaction_end":
        setIsCompacting(false);
        if (event.errorMessage) {
          setCompactError(event.errorMessage as string);
        } else if (!event.aborted) {
          if (sessionIdRef.current) loadSession(sessionIdRef.current);
        }
        break;
    }
  }, [loadSession, onAgentEnd, onSessionNamed, lastEventAtRef, setStalledSecs]);
  handleAgentEventRef.current = handleAgentEvent;

  // Shared by the tGD-command and plain-prompt paths of handleSend: create a
  // new agent session with the current model/tool/thinking selections, wire up
  // SSE, and notify the parent.
  const createNewSession = useCallback(async (
    message: string,
    piImages?: Array<{ type: "image"; data: string; mimeType: string }>,
  ): Promise<string> => {
    if (!newSessionCwd) throw new Error("No cwd for new session");
    const selectedModel = newSessionModel;
    if (selectedModel) setPendingModel(selectedModel);
    const { PRESET_NONE, PRESET_DEFAULT, PRESET_FULL } = await import("@/components/modals/ToolPanel");
    const toolNames = toolPreset === "none" ? PRESET_NONE : toolPreset === "default" ? PRESET_DEFAULT : PRESET_FULL;
    const res = await fetch("/api/agent/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cwd: newSessionCwd,
        type: "prompt",
        message,
        toolNames,
        ...(piImages?.length ? { images: piImages } : {}),
        ...(selectedModel ? { provider: selectedModel.provider, modelId: selectedModel.modelId } : {}),
        ...(thinkingLevel !== "auto" ? { thinkingLevel } : {}),
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json() as { sessionId: string };
    sessionIdRef.current = result.sessionId;
    connectEvents(result.sessionId);
    onSessionCreated?.({
      id: result.sessionId,
      path: "",
      cwd: newSessionCwd,
      name: undefined,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      messageCount: 1,
      firstMessage: message,
    });
    return result.sessionId;
  }, [newSessionCwd, newSessionModel, toolPreset, thinkingLevel, connectEvents, onSessionCreated]);

  const handleSend = useCallback(async (message: string, images?: AttachedImage[]) => {
    if (!message.trim() && !images?.length) return;
    if (agentRunning) return;
    requestNotifyPermission();

    // Bash mode: `!cmd` runs the shell directly (streamed, recorded into the
    // session so the agent sees the result); `!!cmd` keeps it out of context.
    const trimmedForBash = message.trim();
    if (trimmedForBash.startsWith("!") && trimmedForBash.length > 1) {
      if (isNew || !session) {
        showToast("Bash mode needs an active session — send a message first", { type: "warning" });
        return;
      }
      const excludeFromContext = trimmedForBash.startsWith("!!");
      const bashCommand = trimmedForBash.replace(/^!+/, "").trim();
      if (!bashCommand) return;
      await connectEvents(session.id);
      setBashRun({ command: bashCommand, output: "", running: true });
      try {
        await sendAgentCommand(session.id, { type: "bash", command: bashCommand, excludeFromContext });
        // Reload so the persisted bashExecution entry replaces the live block
        await loadSession(session.id);
      } catch (e) {
        console.error("Bash failed:", e);
        showToast(`Bash failed: ${e instanceof Error ? e.message : e}`, { type: "error" });
      } finally {
        setBashRun(null);
      }
      return;
    }
    // Slash commands (/tgd-* included) are NOT special-cased here: they go
    // through the normal prompt path below, where pi's own prompt() resolves
    // them (extension command → input hook → skill → prompt template → plain
    // text). Routing them through /api/agent/[id]/command instead used to
    // break resumed sessions whenever the exact name wasn't a registered
    // extension command, while fresh sessions — which always used the prompt
    // path — worked.

    const imageBlocks = images?.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mimeType, data: img.data } }));
    const userMsg: AgentMessage = {
      role: "user",
      content: imageBlocks?.length
        ? [...(message.trim() ? [{ type: "text" as const, text: message }] : []), ...imageBlocks]
        : message,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setAgentRunning(true);
    setAgentPhase({ kind: "waiting_model" });
    dispatch({ type: "start" });
    pendingScrollToUserRef.current = true;

    const piImages = images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));

    try {
      if (isNew && newSessionCwd) {
        await createNewSession(message, piImages);
      } else if (session) {
        // Wait for the SSE stream to be open before prompting, so the run's
        // first events aren't emitted before we're subscribed.
        await connectEvents(session.id);
        await sendAgentCommand(session.id, {
          type: "prompt",
          message,
          ...(piImages?.length ? { images: piImages } : {}),
        });
      }
    } catch (e) {
      console.error("Failed to send message:", e);
      showToast(`${translate("toast.messageNotSent")}: ${e instanceof Error ? e.message : e}`, { type: "error" });
      setAgentRunning(false);
      setAgentPhase(null);
      dispatch({ type: "end" });
    }
  }, [isNew, newSessionCwd, session, agentRunning, connectEvents, createNewSession, loadSession, pendingScrollToUserRef]);

  const handleAbort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "abort" });
    } catch (e) {
      console.error("Failed to abort:", e);
    }
  }, []);

  const handleFork = useCallback(async (entryId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setForkingEntryId(entryId);
    try {
      const result = await sendAgentCommand<{ cancelled?: boolean; newSessionId?: string }>(sid, {
        type: "fork",
        entryId,
      });
      const { cancelled, newSessionId } = result ?? {};
      if (!cancelled && newSessionId) {
        onSessionForked?.(newSessionId);
      }
    } catch (e) {
      console.error("Fork failed:", e);
      showToast(`${translate("toast.forkFailed")}: ${e instanceof Error ? e.message : e}`, { type: "error" });
    } finally {
      setForkingEntryId(null);
    }
  }, [onSessionForked]);

  const handleNavigate = useCallback(async (entryId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    sendAgentCommand(sid, { type: "navigate_tree", targetId: entryId }).catch(() => {});
    setActiveLeafId(entryId);
    await loadContext(sid, entryId);
  }, [loadContext]);

  const handleLeafChange = useCallback(async (leafId: string | null) => {
    setActiveLeafId(leafId);
    const sid = sessionIdRef.current;
    if (!sid) return;
    await loadContext(sid, leafId);
    if (leafId) {
      sendAgentCommand(sid, { type: "navigate_tree", targetId: leafId }).catch(() => {});
    }
  }, [loadContext]);

  const handleModelChange = useCallback(async (provider: string, modelId: string) => {
    if (isNew) {
      setNewSessionModel({ provider, modelId });
      return;
    }
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_model", provider, modelId });
      setCurrentModelOverride({ provider, modelId });
    } catch (e) {
      console.error("Failed to set model:", e);
    }
  }, [isNew, setNewSessionModel]);

  const handleCompact = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || isCompacting) return;
    setIsCompacting(true);
    setCompactError(null);
    try {
      await sendAgentCommand(sid, { type: "compact" });
      await loadSession(sid, true);
    } catch (e) {
      setCompactError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCompacting(false);
    }
  }, [isCompacting, loadSession]);

  const handleSteer = useCallback(async (message: string, images?: AttachedImage[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setMessages((prev) => [...prev, { role: "user", content: `[steer] ${message}`, timestamp: Date.now() } as AgentMessage]);
    const piImages = images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));
    try {
      await sendAgentCommand(sid, {
        type: "steer",
        message,
        ...(piImages?.length ? { images: piImages } : {}),
      });
    } catch (e) {
      console.error("Failed to steer:", e);
      showToast(`${translate("toast.steerFailed")}: ${e instanceof Error ? e.message : e}`, { type: "error" });
    }
  }, []);

  const handleFollowUp = useCallback(async (message: string, images?: AttachedImage[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    // Don't append to the transcript — the message hasn't been delivered yet.
    // It sits in a visible queue until the current run ends, then shows up as
    // a real user message via the agent_start reload.
    setQueuedFollowUps((prev) => [...prev, message]);
    const piImages = images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));
    try {
      await sendAgentCommand(sid, {
        type: "follow_up",
        message,
        ...(piImages?.length ? { images: piImages } : {}),
      });
    } catch (e) {
      console.error("Failed to follow up:", e);
      setQueuedFollowUps((prev) => prev.filter((m) => m !== message));
      showToast(`${translate("toast.followUpFailed")}: ${e instanceof Error ? e.message : e}`, { type: "error" });
    }
  }, []);

  const handleClearQueue = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "clear_queue" });
      setQueuedFollowUps([]);
    } catch (e) {
      console.error("Failed to clear queue:", e);
    }
  }, []);

  /**
   * Remove ONE queued follow-up. pi's queue API only clears wholesale, so
   * this clears and re-queues the survivors. If the run finishes mid-swap the
   * worst case is a follow-up delivering slightly later — never a duplicate.
   */
  const handleRemoveQueued = useCallback(async (idx: number) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const remaining = queuedFollowUps.filter((_, i) => i !== idx);
    try {
      await sendAgentCommand(sid, { type: "clear_queue" });
      for (const message of remaining) {
        await sendAgentCommand(sid, { type: "follow_up", message });
      }
      setQueuedFollowUps(remaining);
    } catch (e) {
      showToast(`${translate("toast.followUpFailed")}: ${e instanceof Error ? e.message : e}`, { type: "error" });
    }
  }, [queuedFollowUps]);

  /**
   * Re-run the last failed exchange: roll back to the node before the last
   * user message (dropping the errored attempt into a dead branch), then
   * send the same prompt again.
   */
  const handleRetry = useCallback(async () => {
    if (agentRunning) return;
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    const content = (messages[lastUserIdx] as { content?: unknown }).content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? (content as Array<{ type?: string; text?: string }>).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n")
        : "";
    if (!text.trim()) return;
    let prevEntryId: string | undefined;
    for (let i = lastUserIdx - 1; i >= 0; i--) {
      if (entryIds[i]) { prevEntryId = entryIds[i]; break; }
    }
    if (prevEntryId) await handleNavigate(prevEntryId);
    await handleSend(text);
  }, [messages, entryIds, agentRunning, handleNavigate, handleSend]);

  // Edit an earlier user turn in place and re-run from there: roll the tree
  // back to the entry before it (prevEntryId — the assistant turn that
  // preceded it, same target the "Edit from here" nav uses) and send the new
  // text as a fresh branch. Same primitives as handleRetry, but for an
  // arbitrary message with edited content.
  const handleEditRerun = useCallback(async (prevEntryId: string | undefined, newText: string) => {
    if (agentRunning) return;
    if (!newText.trim()) return;
    if (prevEntryId) await handleNavigate(prevEntryId);
    await handleSend(newText);
  }, [agentRunning, handleNavigate, handleSend]);

  const handleAbortBash = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "abort_bash" });
    } catch (e) {
      console.error("Failed to abort bash:", e);
    }
  }, []);

  const handleAbortCompaction = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "abort_compaction" });
    } catch (e) {
      console.error("Failed to abort compaction:", e);
    }
  }, []);

  const handleThinkingLevelChange = useCallback(async (level: ThinkingLevelOption) => {
    setThinkingLevel(level);
    if (level === "auto") return; // "auto" leaves pi's current setting untouched
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_thinking_level", level });
    } catch (e) {
      console.error("Failed to set thinking level:", e);
    }
  }, []);

  const handleToolPresetChange = useCallback(async (preset: "none" | "default" | "full") => {
    const { PRESET_NONE, PRESET_DEFAULT, PRESET_FULL } = await import("@/components/modals/ToolPanel");
    const toolNames = preset === "none" ? PRESET_NONE : preset === "default" ? PRESET_DEFAULT : PRESET_FULL;
    setToolPresetState(preset);
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_tools", toolNames });
    } catch (e) {
      console.error("Failed to set tools:", e);
    }
  }, [setToolPresetState]);

  // Load session on mount
  useEffect(() => {
    if (session) {
      sessionIdRef.current = session.id;
      setIdleTitle(session.name);
      loadSession(session.id, true, true).then((agentState) => {
        if (agentState?.running) {
          loadTools(session.id);
          if (agentState.state?.isStreaming) {
            setAgentRunning(true);
            setAgentPhase({ kind: "waiting_model" });
            connectEvents(session.id);
          }
        }
        if (agentState?.state) {
          if (agentState.state.isCompacting !== undefined) setIsCompacting(agentState.state.isCompacting);
          if (agentState.state.contextUsage !== undefined) setContextUsage(agentState.state.contextUsage ?? null);
          if (agentState.state.systemPrompt !== undefined) setSystemPrompt(agentState.state.systemPrompt ?? null);
          if (agentState.state.thinkingLevel !== undefined) setThinkingLevel((agentState.state.thinkingLevel as ThinkingLevelOption) ?? "auto");
        }
      });
    }
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onSystemPromptChange?.(systemPrompt);
  }, [systemPrompt, onSystemPromptChange]);

  useEffect(() => {
    if (!onBranchDataChange) return;
    onBranchDataChange(data?.tree ?? [], activeLeafId, handleLeafChange);
  }, [data?.tree, activeLeafId, handleLeafChange, onBranchDataChange]);

  // Compact error auto-dismiss
  useEffect(() => {
    if (!compactError) return;
    const t = setTimeout(() => setCompactError(null), 3000);
    return () => clearTimeout(t);
  }, [compactError]);

  return {
    // State
    data, loading, error, activeLeafId, messages, entryIds, streamState,
    agentRunning, modelNames, modelList, modelThinkingLevels, modelThinkingLevelMaps, newSessionModel, toolPreset, thinkingLevel,
    retryInfo, contextUsage, systemPrompt, forkingEntryId,
    isCompacting, compactError, currentModel, displayModel, sessionStats,
    agentPhase, agentStartedAt, queuedFollowUps, bashRun, stalledSecs,
    isNew,
    // Refs
    sessionIdRef, eventSourceRef, messagesEndRef, scrollContainerRef,
    lastUserMsgRef, pendingScrollToUserRef, initialScrollDoneRef,
    // Actions
    handleSend, handleAbort, handleFork, handleNavigate, handleModelChange,
    handleCompact, handleSteer, handleFollowUp, handleAbortCompaction,
    handleToolPresetChange, handleThinkingLevelChange, handleClearQueue, handleRemoveQueued, handleRetry, handleEditRerun, handleAbortBash, loadTools, setActiveLeafId, setData, setMessages,
    dispatch, setAgentRunning, setForkingEntryId,
    // Subscriptions
    handleAgentEventRef,
  };
}