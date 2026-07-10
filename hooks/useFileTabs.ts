"use client";

import { useState, useCallback } from "react";
import type { Tab } from "@/components/layout/TabBar";

export function useFileTabs() {
  const [fileTabs, setFileTabs] = useState<Tab[]>([]);
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  const handleOpenFile = useCallback((filePath: string, fileName: string, gotoLine?: number) => {
    const tabId = `file:${filePath}`;
    // Fresh nonce whenever a line is requested, so reopening an already-open
    // file (or the same file at a new line) re-triggers the jump.
    const gotoNonce = gotoLine ? Date.now() : undefined;
    setFileTabs((prev) => {
      const existing = prev.find((t) => t.id === tabId);
      if (existing) {
        if (!gotoLine) return prev;
        return prev.map((t) => (t.id === tabId ? { ...t, gotoLine, gotoNonce } : t));
      }
      return [...prev, { id: tabId, label: fileName, filePath, gotoLine, gotoNonce }];
    });
    setActiveFileTabId(tabId);
    setRightPanelOpen(true);
  }, []);

  const handleCloseFileTab = useCallback((tabId: string) => {
    setFileTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) setRightPanelOpen(false);
      return next;
    });
    setActiveFileTabId((cur) => {
      if (cur !== tabId) return cur;
      const remaining = fileTabs.filter((t) => t.id !== tabId);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  }, [fileTabs]);

  return {
    fileTabs,
    activeFileTabId,
    rightPanelOpen,
    setRightPanelOpen,
    setActiveFileTabId,
    handleOpenFile,
    handleCloseFileTab,
  };
}
