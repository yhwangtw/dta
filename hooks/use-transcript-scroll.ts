"use client";

import { useRef, useCallback, useEffect } from "react";
import { getAlwaysFollow } from "@/lib/prefs";
import { AT_BOTTOM, loadScrollPosition, saveScrollPosition } from "@/lib/scroll-memory";

/**
 * Transcript scroll management: owns the anchor refs and decides when the
 * view follows new content — initial jump to bottom, scroll-sent-message-
 * to-top, and conditional follow at end of a run.
 */
export function useTranscriptScroll(
  messagesLength: number,
  agentRunning: boolean,
  agentRunningRef: React.RefObject<boolean>,
  /** Session id — enables per-session scroll restore across switches. */
  memoryKey?: string | null,
) {
  const initialScrollDoneRef = useRef(false);
  const lastUserMsgRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollToUserRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const scrollUserMsgToTop = useCallback(() => {
    const container = scrollContainerRef.current;
    const el = lastUserMsgRef.current;
    if (!container || !el) return;
    const elAbsTop = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top: elAbsTop - 16, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messagesLength > 0) {
      if (pendingScrollToUserRef.current) {
        pendingScrollToUserRef.current = false;
        initialScrollDoneRef.current = true;
        scrollUserMsgToTop();
      } else if (!initialScrollDoneRef.current) {
        initialScrollDoneRef.current = true;
        // Restore where this session was left (unless the reader was at the
        // tail — then keep the follow-the-bottom behavior for new content).
        const saved = loadScrollPosition(memoryKey);
        const container = scrollContainerRef.current;
        if (saved !== undefined && saved !== AT_BOTTOM && container) {
          // Content may not be laid out yet (content-visibility) — a single
          // assignment can clamp to a smaller scrollHeight. Re-apply after
          // layout settles.
          container.scrollTop = saved;
          requestAnimationFrame(() => {
            const c = scrollContainerRef.current;
            if (c) c.scrollTop = saved;
          });
          setTimeout(() => {
            const c = scrollContainerRef.current;
            if (c && Math.abs(c.scrollTop - saved) > 4) c.scrollTop = saved;
          }, 80);
        } else {
          scrollToBottom("instant");
        }
      } else if (!agentRunningRef.current) {
        // Only follow to the bottom if the reader is already near it —
        // yanking someone who scrolled up (or is reading the answer from the
        // top anchor) loses their place. Distance is measured fresh here:
        // the run spacer has already unmounted by the time this effect runs.
        const el = scrollContainerRef.current;
        const dist = el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0;
        if (dist < 200 || getAlwaysFollow()) scrollToBottom("smooth");
      }
    }
  }, [messagesLength, agentRunning, agentRunningRef, scrollToBottom, scrollUserMsgToTop, memoryKey]);

  // Record the position (throttled) so switching away and back restores it.
  const hasMessages = messagesLength > 0;
  useEffect(() => {
    if (!memoryKey) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    let ticking = false;
    const record = () => {
      ticking = false;
      // A detached container reads 0/0/0 — dist 0 would masquerade as
      // "at bottom" and clobber the real position saved while scrolling.
      if (!container.isConnected || container.scrollHeight === 0) return;
      saveScrollPosition(
        memoryKey,
        container.scrollTop,
        container.scrollHeight - container.scrollTop - container.clientHeight,
      );
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(record);
      }
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      record(); // final write on unmount (session switch)
    };
  }, [memoryKey, hasMessages]);

  return {
    initialScrollDoneRef, lastUserMsgRef, pendingScrollToUserRef,
    messagesEndRef, scrollContainerRef,
    scrollToBottom, scrollUserMsgToTop,
  };
}
