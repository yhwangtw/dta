"use client";

import { useRef, useCallback, useEffect } from "react";
import { getAlwaysFollow } from "@/lib/prefs";

/**
 * Transcript scroll management: owns the anchor refs and decides when the
 * view follows new content — initial jump to bottom, scroll-sent-message-
 * to-top, and conditional follow at end of a run.
 */
export function useTranscriptScroll(
  messagesLength: number,
  agentRunning: boolean,
  agentRunningRef: React.RefObject<boolean>,
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
        scrollToBottom("instant");
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
  }, [messagesLength, agentRunning, agentRunningRef, scrollToBottom, scrollUserMsgToTop]);

  return {
    initialScrollDoneRef, lastUserMsgRef, pendingScrollToUserRef,
    messagesEndRef, scrollContainerRef,
    scrollToBottom, scrollUserMsgToTop,
  };
}
