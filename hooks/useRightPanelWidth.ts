"use client";

import { useState, useCallback } from "react";

/**
 * Right panel width: draggable splitter, persisted in localStorage.
 * `rightWidth === null` means "use the CSS default (42%)".
 */
export function useRightPanelWidth() {
  const [rightWidth, setRightWidth] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const v = parseInt(localStorage.getItem("pi-right-width") ?? "", 10);
      return Number.isFinite(v) && v >= 320 ? v : null;
    } catch {
      return null;
    }
  });
  const [draggingRight, setDraggingRight] = useState(false);

  const startRightResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDraggingRight(true);
    // Track the latest width in a local so we can persist it *synchronously*
    // on mouseup (not inside a state-updater, which lands a tick late and
    // races the double-click reset). Persist only if the pointer actually
    // moved, so a plain click / the clicks of a double-click never re-save.
    let latest: number | null = null;
    const onMove = (ev: MouseEvent) => {
      const max = Math.round(window.innerWidth * 0.7);
      const w = Math.min(Math.max(window.innerWidth - ev.clientX, 320), max);
      latest = w;
      setRightWidth(w);
    };
    const onUp = () => {
      setDraggingRight(false);
      if (latest != null) {
        try { localStorage.setItem("pi-right-width", String(latest)); } catch { /* ignore */ }
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const resetRightWidth = useCallback(() => {
    setRightWidth(null);
    try { localStorage.removeItem("pi-right-width"); } catch { /* ignore */ }
  }, []);

  return { rightWidth, draggingRight, startRightResize, resetRightWidth };
}
