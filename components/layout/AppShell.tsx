"use client";

import { useState, useCallback, useRef, useEffect, useLayoutEffect, lazy, Suspense } from "react";
import { SessionSidebar } from "../sidebar/SessionSidebar";
import { ChatWindow } from "../chat/ChatWindow";
import { FileViewer } from "./FileViewer";
import { TabBar } from "./TabBar";
import { BranchNavigator } from "../chat/BranchNavigator";
import { useTheme } from "@/hooks/useTheme";
import { useAppShellState } from "@/hooks/useAppShellState";
import { useFileTabs } from "@/hooks/useFileTabs";
import { useSessions } from "@/hooks/useSessions";
import { useTags } from "@/hooks/useTags";
import { useCommandPalette } from "@/hooks/useCommandPalette";
import { useToast } from "@/hooks/useToast";
import { encodeFilePathForApi } from "@/lib/file-paths";
import { useI18n } from "@/lib/i18n";
import { ErrorBoundary } from "./ErrorBoundary";
import { CommandPalette } from "../ui/CommandPalette";
import type { SessionInfo, SessionTreeNode } from "@/lib/types";
import type { ChatInputHandle } from "../chat/ChatInput";
import s from "./AppShell.module.css";

// Lazy-load heavy modals — they're ~1000 lines each and rarely opened
const ModelsConfig = lazy(() => import("../modals/ModelsConfig").then((m) => ({ default: m.ModelsConfig })));
const SkillsConfig = lazy(() => import("../modals/SkillsConfig").then((m) => ({ default: m.SkillsConfig })));
const AnalyticsModal = lazy(() => import("../modals/AnalyticsModal").then((m) => ({ default: m.AnalyticsModal })));

export function AppShell() {
  const { isDark, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const { state, actions, refs, topBarRef } = useAppShellState();
  const { fileTabs, activeFileTabId, rightPanelOpen, setRightPanelOpen, setActiveFileTabId, handleOpenFile, handleCloseFileTab } = useFileTabs();

  const [modelsConfigOpen, setModelsConfigOpen] = useState(false);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [skillsConfigOpen, setSkillsConfigOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const chatInputRef = useRef<ChatInputHandle | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-Hant-TW" : "en";
  }, [locale]);

  // On narrow screens the sidebar is a full-width overlay — starting open
  // would cover the whole app with the toggle button underneath it.
  useLayoutEffect(() => {
    if (window.matchMedia("(max-width: 1024px)").matches) setSidebarOpen(false);
  }, []);

  // On overlay-mode screens, picking or starting a session should reveal the
  // chat it just opened instead of leaving the sidebar covering it.
  const closeSidebarIfOverlay = useCallback(() => {
    if (window.matchMedia("(max-width: 1024px)").matches) setSidebarOpen(false);
  }, []);

  const handleSelectSessionFromSidebar = useCallback((session: SessionInfo, isRestore?: boolean) => {
    actions.handleSelectSession(session, isRestore);
    if (!isRestore) closeSidebarIfOverlay();
  }, [actions, closeSidebarIfOverlay]);

  const handleNewSessionFromSidebar = useCallback((sessionId: string, cwd: string) => {
    actions.handleNewSession(sessionId, cwd);
    closeSidebarIfOverlay();
  }, [actions, closeSidebarIfOverlay]);

  // ── ⌘K Command Palette wiring ──────────────────────────────────────────
  const { allSessions } = useSessions(state.refreshKey);
  const { tags } = useTags();
  const { ToastContainer } = useToast();
  const [paletteFiles, setPaletteFiles] = useState<{ name: string; path: string; isDir: boolean }[]>([]);
  const effectiveCwdForPalette = state.activeCwd ?? state.selectedSession?.cwd ?? state.newSessionCwd;

  // Fetch a flat file list from the active cwd whenever it changes. Capped at
  // ~80 entries; the FileExplorer is a deeper tree but the palette is a quick
  // launcher, not a full browser.
  useEffect(() => {
    let cancelled = false;
    if (!effectiveCwdForPalette) {
      setPaletteFiles([]);
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const encoded = encodeFilePathForApi(effectiveCwdForPalette);
        const res = await fetch(`/api/files/${encoded}?type=list`);
        if (!res.ok) return;
        const data = await res.json() as { entries?: { name: string; isDir: boolean }[] };
        if (cancelled) return;
        const out = (data.entries ?? []).slice(0, 80).map((e) => ({
          name: e.name,
          path: `${effectiveCwdForPalette.replace(/\/$/, "")}/${e.name}`,
          isDir: e.isDir,
        }));
        setPaletteFiles(out);
      } catch {
        // best-effort
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveCwdForPalette, state.explorerRefreshKey]);

  const palette = useCommandPalette({
    sessions: allSessions,
    tags,
    files: paletteFiles,
    activeTag: activeTagFilter,
    onClearTag: () => setActiveTagFilter(null),
  });

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    if (!shortcutsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShortcutsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutsOpen]);

  // Global hotkeys. Every hint shown in the ⌘K palette must be bound here —
  // an advertised shortcut that does nothing reads as a broken app.
  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "k" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (isEditable(e.target)) return; // let normal typing happen
        palette.toggle();
        return;
      }
      // ⇧⌘M — Models (plain ⌘M is the macOS minimize shortcut, unreachable)
      if (key === "m" && e.shiftKey) {
        e.preventDefault();
        setModelsConfigOpen(true);
        return;
      }
      if (key === "/" && !e.shiftKey) {
        e.preventDefault();
        if (effectiveCwdForPalette) setSkillsConfigOpen(true);
        return;
      }
      if (key === "b" && !e.shiftKey) {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        return;
      }
      if (key === "\\" && !e.shiftKey) {
        e.preventDefault();
        setRightPanelOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette, effectiveCwdForPalette, setRightPanelOpen]);

  // Register the action callbacks the palette can fire.
  useEffect(() => {
    palette.register({
      openModels: () => setModelsConfigOpen(true),
      openSkills: () => setSkillsConfigOpen(true),
      openAnalytics: () => setAnalyticsOpen(true),
      toggleTheme: () => toggleTheme(),
      toggleSidebar: () => setSidebarOpen((v) => !v),
      toggleFilePanel: () => setRightPanelOpen((v) => !v),
      newSession: () => {
        if (!effectiveCwdForPalette) return;
        const tempId = typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        handleNewSessionFromSidebar(tempId, effectiveCwdForPalette);
      },
      openParallelForActive: () => {
        if (state.selectedSession) actions.openParallel(state.selectedSession);
      },
      openHelp: () => setShortcutsOpen(true),
    });
  }, [palette, toggleTheme, actions, effectiveCwdForPalette, state.selectedSession, setRightPanelOpen, handleNewSessionFromSidebar]);

  // Helper: turn a session id into the full SessionInfo record (palette only
  // stores the id in its data when the user picked it via the palette).
  const handlePaletteSelectSession = useCallback(
    (sessionId: string) => {
      const session = allSessions.find((s) => s.id === sessionId);
      if (session) handleSelectSessionFromSidebar(session);
    },
    [allSessions, handleSelectSessionFromSidebar],
  );

  const handlePaletteSelectTag = useCallback(
    (tag: string) => setActiveTagFilter(tag),
    [],
  );

  const handleBranchLeafChange = useCallback((leafId: string | null) => {
    refs.branchLeafChangeFnRef.current?.(leafId);
  }, [refs]);

  const handleBranchDataChange = useCallback(
    (tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => {
      actions.setBranchTree(tree);
      actions.setBranchActiveLeafId(activeLeafId);
      refs.branchLeafChangeFnRef.current = onLeafChange;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions.setBranchTree, actions.setBranchActiveLeafId, refs.branchLeafChangeFnRef]
  );

  const handleAtMention = useCallback((relativePath: string) => {
    chatInputRef.current?.insertText("`" + relativePath + "`");
  }, []);

  const handleExportSession = useCallback(() => {
    if (!state.selectedSession) return;
    window.location.href = `/api/sessions/${encodeURIComponent(state.selectedSession.id)}/export`;
  }, [state.selectedSession]);

  const handleExportMarkdown = useCallback(() => {
    if (!state.selectedSession) return;
    window.location.href = `/api/sessions/${encodeURIComponent(state.selectedSession.id)}/export-md`;
  }, [state.selectedSession]);

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [exportMenuOpen]);

  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd = state.newSessionCwd ?? (state.selectedSession === null && state.activeCwd ? state.activeCwd : null);
  const showChat = state.selectedSession !== null || effectiveNewSessionCwd !== null;
  const showPlaceholder = state.initialSessionRestored && !showChat;

  const activeFileTab = fileTabs.find((t) => t.id === activeFileTabId) ?? null;

  const sidebarContent = (
    <ErrorBoundary>
      <SessionSidebar
        selectedSessionId={state.selectedSession?.id ?? null}
        onSelectSession={handleSelectSessionFromSidebar}
        onNewSession={handleNewSessionFromSidebar}
        initialSessionId={state.initialSessionId}
        onInitialRestoreDone={actions.handleInitialRestoreDone}
        refreshKey={state.refreshKey}
        onSessionDeleted={actions.handleSessionDeleted}
        selectedCwd={state.selectedSession?.cwd ?? state.newSessionCwd ?? null}
        onCwdChange={actions.handleCwdChange}
        onOpenFile={handleOpenFile}
        explorerRefreshKey={state.explorerRefreshKey}
        onAtMention={handleAtMention}
        onOpenParallel={actions.openParallel}
        parallelSessionIds={state.parallelSessions.map((s) => s.id)}
        activeTagFilter={activeTagFilter}
        onSelectTagFilter={setActiveTagFilter}
      />
      <div className={s.sidebarFooter}>
        {([
          {
            label: t("sidebar.models"),
            onClick: () => setModelsConfigOpen(true),
            disabled: false,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
              </svg>
            ),
          },
          {
            label: t("sidebar.skills"),
            onClick: () => setSkillsConfigOpen(true),
            disabled: !state.activeCwd && !state.selectedSession?.cwd && !state.newSessionCwd,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            ),
          },
        ] as { label: string; onClick: () => void; disabled: boolean; icon: React.ReactNode }[]).map(({ label, onClick, disabled, icon }) => (
          <button
            key={label}
            onClick={onClick}
            disabled={disabled}
            title={label}
            className={`${s.sidebarFooterButton} ${disabled ? s.sidebarFooterButtonDisabled : s.sidebarFooterButtonEnabled}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </ErrorBoundary>
  );

  return (
    <>
    <div className={s.container}>
      {/* Mobile overlay backdrop */}
      <div
        className="sidebar-overlay-backdrop"
        onClick={() => setSidebarOpen(false)}
        style={{
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "auto" : "none",
        }}
      />

      {/* Left sidebar */}
      <div
        className={`sidebar-container${sidebarOpen ? " sidebar-open" : " sidebar-closed"} ${s.sidebarContainer}`}
      >
        {sidebarContent}
      </div>

      {/* Center: chat */}
      <div className={s.centerPanel}>
        {/* Top bar with sidebar toggle */}
        <div ref={topBarRef} className={s.topBar}>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? t("topbar.hideSidebar") : t("topbar.showSidebar")}
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? t("topbar.hideSidebar") : t("topbar.showSidebar")}
            className={s.topBarButton}
          >
            {sidebarOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
          <button
            onClick={() => palette.open()}
            title={t("topbar.searchTitle")}
            aria-label={t("topbar.searchTitle")}
            className={s.commandPaletteTrigger}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>{t("topbar.search")}</span>
            <span className={s.commandPaletteKbd} aria-hidden>⌘K</span>
          </button>
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            }}
            title={isDark ? t("topbar.lightMode") : t("topbar.darkMode")}
            aria-label={isDark ? t("topbar.lightMode") : t("topbar.darkMode")}
            aria-pressed={isDark}
            className={s.topBarButton}
          >
            {isDark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="5.64" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setLocale(locale === "en" ? "zh" : "en")}
            title={t("topbar.language")}
            aria-label={t("topbar.language")}
            className={s.topBarButton}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </button>
          {showChat && (
            <div className={s.chatActions}>
              <div className={s.exportMenuWrapper} ref={exportMenuRef}>
                <button
                  onClick={() => setExportMenuOpen((v) => !v)}
                  disabled={!state.selectedSession}
                  title={state.selectedSession ? t("topbar.exportTitle") : t("topbar.exportDisabled")}
                  aria-label={t("topbar.exportTitle")}
                  aria-haspopup="menu"
                  aria-expanded={exportMenuOpen}
                  className={`${s.exportButton} ${state.selectedSession ? s.exportButtonEnabled : s.exportButtonDisabled}`}
                >
                  <span
                    className={s.exportIcon}
                    style={{ color: state.selectedSession ? "var(--text-muted)" : "var(--text-dim)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </span>
                  <span>{t("topbar.export")}</span>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <polyline points="2 4 5 7 8 4" />
                  </svg>
                </button>
                {exportMenuOpen && state.selectedSession && (
                  <div className={s.exportMenu} role="menu">
                    <button
                      onClick={() => { handleExportSession(); setExportMenuOpen(false); }}
                      className={s.exportMenuItem}
                      role="menuitem"
                    >
                      <strong>HTML</strong>
                      <span className={s.exportMenuHint}>{t("topbar.exportHtmlHint")}</span>
                    </button>
                    <button
                      onClick={() => { handleExportMarkdown(); setExportMenuOpen(false); }}
                      className={s.exportMenuItem}
                      role="menuitem"
                    >
                      <strong>Markdown</strong>
                      <span className={s.exportMenuHint}>{t("topbar.exportMdHint")}</span>
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setAnalyticsOpen(true)}
                className={`${s.systemButton} ${s.systemButtonDefault} hover-text`}
                title={t("topbar.analyticsTitle")}
                aria-label={t("topbar.analyticsTitle")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)", flexShrink: 0 }}>
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <span>{t("topbar.analytics")}</span>
              </button>
              <BranchNavigator
                tree={state.branchTree}
                activeLeafId={state.branchActiveLeafId}
                onLeafChange={handleBranchLeafChange}
                inline
                containerRef={topBarRef}
                open={state.activeTopPanel === "branches"}
                onToggle={() => actions.toggleTopPanel("branches")}
                hasSession
              />
              <button
                onClick={() => actions.toggleTopPanel("system")}
                className={`${s.systemButton} ${state.activeTopPanel === "system" ? s.systemButtonActive : s.systemButtonDefault} hover-text`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: state.systemPrompt ? "var(--accent)" : "var(--text-dim)", flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="13" y2="17" />
                </svg>
                <span>{t("topbar.system")}</span>
              </button>
            </div>
          )}
          {/* Session stats — right-aligned in top bar */}
          {showChat && (state.sessionStats || state.contextUsage) && (() => {
            const t = state.sessionStats?.tokens;
            const c = state.sessionStats?.cost ?? 0;
            const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
            const costStr = c > 0 ? (c >= 0.01 ? `$${c.toFixed(2)}` : `<$0.01`) : null;

            let ctxColor = "var(--text-muted)";
            let ctxStr: string | null = null;
            if (state.contextUsage?.contextWindow) {
              const pct = state.contextUsage.percent;
              if (pct !== null && pct > 90) ctxColor = "var(--color-error)";
              else if (pct !== null && pct > 70) ctxColor = "var(--color-warning-text-strong)";
              ctxStr = pct !== null ? `${pct.toFixed(0)}% / ${fmt(state.contextUsage.contextWindow)}` : `? / ${fmt(state.contextUsage.contextWindow)}`;
            }

            const tooltipParts: string[] = [];
            if (t) {
              tooltipParts.push(`in: ${t.input.toLocaleString()}`);
              tooltipParts.push(`out: ${t.output.toLocaleString()}`);
              tooltipParts.push(`cache read: ${t.cacheRead.toLocaleString()}`);
              tooltipParts.push(`cache write: ${t.cacheWrite.toLocaleString()}`);
              if (c > 0) tooltipParts.push(`cost: $${c.toFixed(4)}`);
            }
            if (state.contextUsage?.contextWindow) {
              const pct = state.contextUsage.percent;
              tooltipParts.push(`context: ${pct !== null ? pct.toFixed(1) + "%" : "unknown"} of ${state.contextUsage.contextWindow.toLocaleString()} tokens`);
            }
            const tooltip = tooltipParts.join("  |  ");

            return (
              <div
                title={tooltip}
                className={s.sessionStats}
                style={{ paddingRight: rightPanelOpen ? 12 : 48 }}
              >
                {t && t.input > 0 && (
                  <span className={s.tokenStat}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="8.5" x2="5" y2="1.5" /><polyline points="2 4 5 1.5 8 4" />
                    </svg>
                    {fmt(t.input)}
                  </span>
                )}
                {t && t.output > 0 && (
                  <span className={s.tokenStat}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="1.5" x2="5" y2="8.5" /><polyline points="2 6 5 8.5 8 6" />
                    </svg>
                    {fmt(t.output)}
                  </span>
                )}
                {t && t.cacheRead > 0 && (
                  <span className={s.tokenStat}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8.5 5a3.5 3.5 0 1 1-1-2.45" /><polyline points="6.5 1.5 8.5 2.5 7.5 4.5" />
                    </svg>
                    {fmt(t.cacheRead)}
                  </span>
                )}
                {costStr && (
                  <span className={s.costStat}>
                    {costStr}
                  </span>
                )}
                {ctxStr && (
                  <span className={s.contextStat} style={{ color: ctxColor }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 9 L1 5 Q1 1 5 1 Q9 1 9 5 L9 9" /><line x1="1" y1="9" x2="9" y2="9" />
                    </svg>
                    {ctxStr}
                  </span>
                )}
              </div>
            );
          })()}
          {/* Top panel dropdown — shared, only one active at a time */}
          {state.activeTopPanel && state.topPanelPos && (
            <div
              className={s.topPanelDropdown}
              style={{
                top: state.topPanelPos.top,
                left: state.topPanelPos.left,
                width: state.topPanelPos.width,
              }}
            >
              {state.activeTopPanel === "system" && (
                <div className={s.systemPanel}>
                  {state.systemPrompt ? (
                    <div className={s.systemPromptContent}>
                      {state.systemPrompt}
                    </div>
                  ) : state.systemPrompt === "" ? (
                    <div className={s.systemPromptPlaceholder}>
                      {t("system.empty")}
                    </div>
                  ) : (
                    <div className={s.systemPromptPlaceholder}>
                      {t("system.notLoaded")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Chat content */}
        <div className={s.chatContent}>
          {state.parallelSessions.length > 0 && (state.selectedSession || effectiveNewSessionCwd) ? (
            <div className={s.parallelContainer}>
              <div className={s.parallelPane}>
                {showChat && (
                  <ChatWindow
                    key={`main-${state.sessionKey}`}
                    session={state.selectedSession}
                    newSessionCwd={effectiveNewSessionCwd}
                    onAgentEnd={actions.handleAgentEnd}
                    onSessionCreated={actions.handleSessionCreated}
                    onSessionForked={actions.handleSessionForked}
                    modelsRefreshKey={modelsRefreshKey}
                    chatInputRef={chatInputRef}
                    onBranchDataChange={handleBranchDataChange}
                    onSystemPromptChange={actions.setSystemPrompt}
                    onSessionStatsChange={actions.setSessionStats}
                    onContextUsageChange={actions.setContextUsage}
                    onSessionNamed={actions.bumpRefreshKey}
                    isParallel
                    paneLabel={state.selectedSession?.name ?? state.selectedSession?.id.slice(0, 8)}
                  />
                )}
              </div>
              {state.parallelSessions.map((session, idx) => (
                <div key={session.id} className={s.parallelPane}>
                  <ChatWindow
                    key={`parallel-${session.id}-${idx}`}
                    session={session}
                    newSessionCwd={null}
                    modelsRefreshKey={modelsRefreshKey}
                    onAgentEnd={actions.handleAgentEnd}
                    onSessionCreated={actions.handleSessionCreated}
                    onSessionForked={actions.handleSessionForked}
                    onSessionNamed={actions.bumpRefreshKey}
                    isParallel
                    paneLabel={session.name ?? session.id.slice(0, 8)}
                    onClosePane={state.parallelActiveId === session.id || state.parallelSessions.length > 1
                      ? () => actions.closeParallel(session.id)
                      : undefined}
                  />
                </div>
              ))}
            </div>
          ) : showChat ? (
            <ChatWindow
              key={state.sessionKey}
              session={state.selectedSession}
              newSessionCwd={effectiveNewSessionCwd}
              onAgentEnd={actions.handleAgentEnd}
              onSessionCreated={actions.handleSessionCreated}
              onSessionForked={actions.handleSessionForked}
              modelsRefreshKey={modelsRefreshKey}
              chatInputRef={chatInputRef}
              onBranchDataChange={handleBranchDataChange}
              onSystemPromptChange={actions.setSystemPrompt}
              onSessionStatsChange={actions.setSessionStats}
              onContextUsageChange={actions.setContextUsage}
              onSessionNamed={actions.bumpRefreshKey}
            />
          ) : showPlaceholder ? (
            state.activeCwd ? (
              <div className={s.placeholderContainer}>
                <div className={s.placeholderIconBg}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={s.placeholderIcon}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className={s.placeholderText}>
                  <div className={s.placeholderTitle}>{t("welcome.selectSession")}</div>
                  <div className={s.placeholderSubtitle}>
                    {t("welcome.chooseFromSidebar")}
                  </div>
                </div>
              </div>
            ) : (
              <div className={s.welcomeContainer}>
                <div className={s.welcomeIconBg}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <line x1="9" y1="10" x2="15" y2="10" />
                  </svg>
                </div>
                <div className={s.placeholderText}>
                  <div className={s.welcomeTitle}>
                    <span className={s.piSymbol}>π</span>
                    <span className={s.titleText}>with tGD</span>
                  </div>
                  <div className={s.welcomeSubtitle}>
                    {t("welcome.subtitle")}
                  </div>
                </div>
                <div className={s.welcomeSteps}>
                  <div className={s.welcomeStep}>
                    <span className={s.welcomeStepNumber}>1</span>
                    <span className={s.welcomeStepText}>{t("welcome.step1")}</span>
                  </div>
                  <div className={s.welcomeStep}>
                    <span className={s.welcomeStepNumber}>2</span>
                    <span className={s.welcomeStepText}>{t("welcome.step2pre")} <strong style={{ color: "var(--text)" }}>+ {t("sidebar.new")}</strong> {t("welcome.step2post")}</span>
                  </div>
                  <div className={s.welcomeStep}>
                    <span className={s.welcomeStepNumber}>3</span>
                    <span className={s.welcomeStepText}>{t("welcome.step3pre")} <strong style={{ color: "var(--text)" }}>{t("sidebar.models")}</strong> {t("welcome.step3post")}</span>
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>

      {/* Right panel: file viewer — always mounted, width animated via CSS */}
      <div
        className={`right-panel-container${rightPanelOpen ? " right-panel-open" : " right-panel-closed"} ${s.rightPanelContainer}`}
      >
        {/* Right panel tab bar */}
        <div className={s.rightPanelTabBar}>
          <div className={s.rightPanelTabBarInner}>
            <TabBar
              tabs={fileTabs}
              activeTabId={activeFileTabId ?? ""}
              onSelectTab={setActiveFileTabId}
              onCloseTab={handleCloseFileTab}
            />
          </div>

        </div>

        {/* File content */}
        <div className={s.rightPanelContent}>
          {activeFileTab?.filePath ? (
            <FileViewer filePath={activeFileTab.filePath} cwd={state.activeCwd ?? undefined} />
          ) : (
            <div className={s.rightPanelEmpty}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div className={s.rightPanelEmptyTitle}>{t("rightPanel.noFile")}</div>
              <div className={s.rightPanelEmptyHint}>
                {t("rightPanel.noFileHint")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    {/* File panel toggle — always visible at top-right */}
    <button
      onClick={() => setRightPanelOpen((v) => !v)}
      title={rightPanelOpen ? t("topbar.hideFilePanel") : t("topbar.showFilePanel")}
      className={`${s.filePanelToggle} hover-text`}
      style={{ color: rightPanelOpen ? "var(--text)" : "var(--text-muted)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    </button>
    {modelsConfigOpen && <Suspense fallback={null}><ModelsConfig onClose={() => { setModelsConfigOpen(false); setModelsRefreshKey((k) => k + 1); }} /></Suspense>}
    {skillsConfigOpen && (state.activeCwd ?? state.selectedSession?.cwd ?? state.newSessionCwd) && (
      <Suspense fallback={null}><SkillsConfig cwd={(state.activeCwd ?? state.selectedSession?.cwd ?? state.newSessionCwd)!} onClose={() => setSkillsConfigOpen(false)} /></Suspense>
    )}
    {analyticsOpen && <Suspense fallback={null}><AnalyticsModal open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} /></Suspense>}
    {shortcutsOpen && (
      <div
        className={s.shortcutsOverlay}
        onClick={(e) => { if (e.target === e.currentTarget) setShortcutsOpen(false); }}
        onKeyDown={(e) => { if (e.key === "Escape") setShortcutsOpen(false); }}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className={s.shortcutsDialog}>
          <h3 className={s.shortcutsTitle}>{t("shortcuts.title")}</h3>
          {([
            ["⌘K", t("shortcuts.palette")],
            ["⇧⌘M", t("shortcuts.models")],
            ["⌘/", t("shortcuts.skills")],
            ["⌘B", t("shortcuts.sidebar")],
            ["⌘\\", t("shortcuts.filePanel")],
            ["Esc", t("shortcuts.close")],
          ] as [string, string][]).map(([keys, label]) => (
            <div key={keys} className={s.shortcutRow}>
              <span>{label}</span>
              <span className={s.shortcutKbd}>{keys}</span>
            </div>
          ))}
        </div>
      </div>
    )}
    {/* ⌘K Command Palette — last so it sits on top of every modal */}
    <CommandPalette
      palette={palette}
      onSelectSession={handlePaletteSelectSession}
      onSelectTag={handlePaletteSelectTag}
      onOpenFile={handleOpenFile}
    />
    {/* Toast notifications — mount once at app root */}
    <ToastContainer />
    </>
  );
}
