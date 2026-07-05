"use client";

import { useState, useCallback, useEffect, useRef } from "react";

/**
 * Manages file explorer open/close state and refresh indicator.
 *
 * @param explorerRefreshKey - When this changes, explorer content is remounted via key bump.
 */
export function useExplorer(explorerRefreshKey?: number) {
  // Persisted: whether the embedded tree in the sessions panel is expanded is
  // a real preference (some people want sessions-only, some want both).
  const [explorerOpen, setExplorerOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem("pi-explorer-open") !== "closed";
    } catch {
      return true;
    }
  });
  const [explorerKey, setExplorerKey] = useState(0);
  const [explorerRefreshDone, setExplorerRefreshDone] = useState(false);
  const explorerRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (explorerRefreshKey !== undefined) setExplorerKey((k) => k + 1);
  }, [explorerRefreshKey]);

  const toggleExplorer = useCallback(() => {
    setExplorerOpen((v) => {
      try {
        localStorage.setItem("pi-explorer-open", v ? "closed" : "open");
      } catch {
        // ignore
      }
      return !v;
    });
  }, []);

  const refreshExplorer = useCallback(() => {
    setExplorerKey((k) => k + 1);
    setExplorerRefreshDone(true);
    if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
    explorerRefreshTimerRef.current = setTimeout(() => setExplorerRefreshDone(false), 2000);
  }, []);

  return { explorerOpen, explorerKey, explorerRefreshDone, toggleExplorer, refreshExplorer };
}
