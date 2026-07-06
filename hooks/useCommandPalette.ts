"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { SessionInfo } from "@/lib/types";
import type { SessionTags } from "./useTags";

// ── Result types ───────────────────────────────────────────────────────────

export type PaletteResultKind = "session" | "tag" | "file" | "action";

export interface PaletteResult {
  id: string;
  kind: PaletteResultKind;
  title: string;
  subtitle: string;
  /** Optional search-haystack boost term; matched independently of title/subtitle. */
  keywords?: string;
  /** Right-aligned hotkey hint chip, e.g. "↵" or "⇧⌘P". */
  hint?: string;
  /** Free-form payload — discriminated by `kind`. */
  data: unknown;
}

export type PaletteActionId =
  | "settings:models"
  | "settings:skills"
  | "settings:analytics"
  | "settings:appearance"
  | "view:toggle-theme"
  | "view:toggle-sidebar"
  | "view:toggle-file-panel"
  | "view:toggle-chat-width"
  | "view:toggle-follow"
  | "skin:terminal"
  | "skin:industrial"
  | "skin:aurora"
  | "skin:editorial"
  | "skin:glass"
  | "view:clear-tag"
  | "session:new"
  | "session:open-parallel"
  | "help:shortcuts";

export interface CommandPaletteApi {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  query: string;
  setQuery: (q: string) => void;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  results: PaletteResult[];
  runAction: (r: PaletteResult) => void;
  // Wiring the action registry is the consumer's job; we only store the
  // callbacks we need to fire and let the host provide them via register().
  register: (callbacks: PaletteCallbacks) => void;
}

export interface PaletteCallbacks {
  openModels: () => void;
  openSkills: () => void;
  openAnalytics: () => void;
  openAppearance: () => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  toggleFilePanel: () => void;
  toggleChatWidth: () => void;
  toggleFollowStream: () => void;
  setSkin: (skin: "terminal" | "industrial" | "aurora" | "editorial" | "glass") => void;
  newSession: () => void;
  openParallelForActive: () => void;
  openHelp: () => void;
}

// ── Built-in action list ───────────────────────────────────────────────────

const ACTIONS: PaletteResult[] = [
  {
    id: "action:models",
    kind: "action",
    title: "Open Models",
    subtitle: "Configure providers, API keys, model selection",
    keywords: "provider api key llm 模型 設定",
    hint: "⇧⌘M",
    data: { action: "settings:models" } as { action: PaletteActionId },
  },
  {
    id: "action:skills",
    kind: "action",
    title: "Open Skills",
    subtitle: "Browse and toggle installed agent skills",
    keywords: "skill plugin extension 技能",
    hint: "⌘/",
    data: { action: "settings:skills" } as { action: PaletteActionId },
  },
  {
    id: "action:analytics",
    kind: "action",
    title: "Open Analytics",
    subtitle: "Token usage and cost report for the active session",
    keywords: "stats tokens cost 分析 統計 成本",
    data: { action: "settings:analytics" } as { action: PaletteActionId },
  },
  {
    id: "action:appearance",
    kind: "action",
    title: "Open Appearance",
    subtitle: "Pick a skin and light/dark theme",
    keywords: "skin theme appearance picker 外觀 皮膚 主題",
    data: { action: "settings:appearance" } as { action: PaletteActionId },
  },
  {
    id: "action:toggle-theme",
    kind: "action",
    title: "Toggle Theme",
    subtitle: "Switch between light and dark mode",
    keywords: "dark light mode appearance 主題 深色 淺色",
    data: { action: "view:toggle-theme" } as { action: PaletteActionId },
  },
  {
    id: "action:toggle-sidebar",
    kind: "action",
    title: "Toggle Sidebar",
    subtitle: "Show or hide the session sidebar",
    hint: "⌘B",
    data: { action: "view:toggle-sidebar" } as { action: PaletteActionId },
  },
  {
    id: "action:toggle-file-panel",
    kind: "action",
    title: "Toggle File Panel",
    subtitle: "Show or hide the file viewer panel",
    hint: "⌘\\",
    data: { action: "view:toggle-file-panel" } as { action: PaletteActionId },
  },
  {
    id: "action:skin-terminal",
    kind: "action",
    title: "Appearance: Terminal",
    subtitle: "Near-black with emerald",
    keywords: "skin theme appearance emerald green 外觀 風格 綠",
    data: { action: "skin:terminal" } as { action: PaletteActionId },
  },
  {
    id: "action:skin-industrial",
    kind: "action",
    title: "Appearance: Industrial",
    subtitle: "Pure monochrome, high contrast",
    keywords: "skin theme appearance mono black white 外觀 風格 黑白",
    data: { action: "skin:industrial" } as { action: PaletteActionId },
  },
  {
    id: "action:skin-aurora",
    kind: "action",
    title: "Appearance: Aurora",
    subtitle: "Deep violet with soft glow",
    keywords: "skin theme appearance violet purple 外觀 風格 紫",
    data: { action: "skin:aurora" } as { action: PaletteActionId },
  },
  {
    id: "action:skin-editorial",
    kind: "action",
    title: "Appearance: Editorial",
    subtitle: "Warm paper tones with burnt orange — the default",
    keywords: "skin theme appearance warm paper orange 外觀 風格 紙 橙",
    data: { action: "skin:editorial" } as { action: PaletteActionId },
  },
  {
    id: "action:skin-glass",
    kind: "action",
    title: "Appearance: Glass",
    subtitle: "Frosted panels over an aurora gradient",
    keywords: "skin theme appearance glass frost blur glassmorphism 外觀 風格 玻璃 磨砂",
    data: { action: "skin:glass" } as { action: PaletteActionId },
  },
  {
    id: "action:toggle-chat-width",
    kind: "action",
    title: "Toggle Wide Chat",
    subtitle: "Switch the conversation between normal and wide width",
    keywords: "width wide narrow layout 寬度",
    data: { action: "view:toggle-chat-width" } as { action: PaletteActionId },
  },
  {
    id: "action:toggle-follow",
    kind: "action",
    title: "Toggle Always-Follow Output",
    subtitle: "Keep the view pinned to streaming output, terminal-style (default off)",
    keywords: "follow scroll stream pin tail terminal auto 跟隨 捲動 黏底 自動",
    data: { action: "view:toggle-follow" } as { action: PaletteActionId },
  },
  {
    id: "action:new-session",
    kind: "action",
    title: "New Session",
    subtitle: "Start a fresh session in the active project",
    keywords: "create new chat 新增",
    data: { action: "session:new" } as { action: PaletteActionId },
  },
  {
    id: "action:open-parallel",
    kind: "action",
    title: "Open Active Session in Parallel View",
    subtitle: "Side-by-side comparison with the current session",
    keywords: "split compare 並排 比較",
    data: { action: "session:open-parallel" } as { action: PaletteActionId },
  },
  {
    id: "action:help",
    kind: "action",
    title: "Keyboard Shortcuts",
    subtitle: "Show all available hotkeys",
    keywords: "hotkey help docs 快捷鍵 說明",
    data: { action: "help:shortcuts" } as { action: PaletteActionId },
  },
];

// ── Static actions result list (ref-safe, doesn't change between renders) ──
const ACTIONS_RESULTS: readonly PaletteResult[] = Object.freeze(ACTIONS);

// ── Fuse-lite scoring: substring scoring, exact-prefix and word-boundary
//    matches win ────────────────────────────────────────────────────────────

interface Score {
  value: number;
  matched: boolean;
}

function score(haystack: string, query: string): Score {
  if (!query) return { value: 0, matched: true };
  const h = haystack.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return { value: 0, matched: true };
  if (h === q) return { value: 1000, matched: true };
  if (h.startsWith(q)) return { value: 500, matched: true };
  // word-boundary match
  const wbIdx = h.search(new RegExp(`(?:^|\\b|[/_-])${escapeRegex(q)}`));
  if (wbIdx >= 0) return { value: 250 - wbIdx, matched: true };
  if (h.includes(q)) return { value: 100 - h.indexOf(q), matched: true };
  // fuzzy: every char of q appears in order
  let i = 0;
  for (let j = 0; j < h.length && i < q.length; j++) {
    if (h[j] === q[i]) i++;
  }
  if (i === q.length) return { value: 10, matched: true };
  return { value: 0, matched: false };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UseCommandPaletteArgs {
  sessions: SessionInfo[];
  tags: SessionTags;
  /** Recent / cached list of files under active cwd. Optional. */
  files?: { name: string; path: string; isDir: boolean }[];
  /**
   * Currently active tag filter. When set, the command palette exposes a
   * "Clear filter" action so users can reset it.
   */
  activeTag?: string | null;
  onClearTag?: () => void;
}

export function useCommandPalette({
  sessions,
  tags,
  files = [],
  activeTag = null,
  onClearTag,
}: UseCommandPaletteArgs): CommandPaletteApi {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const cbRef = useRef<PaletteCallbacks | null>(null);

  const open = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    setSelectedIndex(0);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const register = useCallback((cbs: PaletteCallbacks) => {
    cbRef.current = cbs;
  }, []);

  // ── Build result list ────────────────────────────────────────────────────
  const results = useMemo<PaletteResult[]>(() => {
    const all: PaletteResult[] = [];

    // Sessions
    for (const s of sessions) {
      const title = s.name?.trim() || s.firstMessage?.split("\n")[0]?.slice(0, 80) || s.id.slice(0, 8);
      const cwd = s.cwd ?? "";
      const sub = `${cwd} · ${s.messageCount} msg${s.messageCount === 1 ? "" : "s"}`;
      all.push({
        id: `session:${s.id}`,
        kind: "session",
        title,
        subtitle: sub,
        hint: s.id.slice(0, 8),
        data: s,
      });
    }

    // Tags — synthesise from the tags map
    const tagEntries = Object.entries(tags)
      .map(([tag, ids]) => ({ tag, count: ids.length }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    for (const { tag, count } of tagEntries) {
      all.push({
        id: `tag:${tag}`,
        kind: "tag",
        title: `#${tag}`,
        subtitle: `${count} session${count === 1 ? "" : "s"}`,
        data: { tag, count },
      });
    }

    // Files
    for (const f of files) {
      if (f.isDir) continue; // only show openable files
      const title = f.name;
      const sub = f.path;
      all.push({
        id: `file:${f.path}`,
        kind: "file",
        title,
        subtitle: sub,
        data: f,
      });
    }

    // Active-tag clear filter action (if a filter is active)
    if (activeTag) {
      all.push({
        id: "action:clear-tag",
        kind: "action",
        title: `Clear tag filter (#${activeTag})`,
        subtitle: "Show all sessions",
        data: { action: "view:clear-tag" } as { action: PaletteActionId },
      });
    }

    // Built-in actions
    all.push(...ACTIONS_RESULTS);

    if (!query.trim()) {
      // No query: keep the natural order, cap to ~50 results.
      return all.slice(0, 50);
    }

    // Score and filter
    const scored = all
      .map((r) => {
        const titleScore = score(r.title, query).value;
        const subScore = score(r.subtitle, query).value;
        const kwScore = r.keywords ? score(r.keywords, query).value : 0;
        const best = Math.max(titleScore, subScore, kwScore);
        return { r, best };
      })
      .filter(({ best }) => best > 0)
      .sort((a, b) => b.best - a.best)
      .slice(0, 50)
      .map(({ r }) => r);
    return scored;
  }, [sessions, tags, files, query, activeTag]);

  // Keep selectedIndex in range whenever the result list shrinks.
  useEffect(() => {
    if (selectedIndex >= results.length) setSelectedIndex(Math.max(0, results.length - 1));
  }, [results.length, selectedIndex]);

  const runAction = useCallback((r: PaletteResult) => {
    const cbs = cbRef.current;
    if (r.kind === "session") {
      // host binds the actual selection via onSelectSession — handled by caller
      return;
    }
    if (r.kind === "tag") {
      // host binds tag filter
      return;
    }
    if (r.kind === "file") {
      // host binds file open
      return;
    }
    if (r.kind === "action") {
      const action = (r.data as { action: PaletteActionId }).action;
      if (action === "view:clear-tag") {
        onClearTag?.();
        return;
      }
      if (!cbs) return;
      switch (action) {
        case "settings:models": cbs.openModels(); break;
        case "settings:skills": cbs.openSkills(); break;
        case "settings:analytics": cbs.openAnalytics(); break;
        case "settings:appearance": cbs.openAppearance(); break;
        case "view:toggle-theme": cbs.toggleTheme(); break;
        case "view:toggle-sidebar": cbs.toggleSidebar(); break;
        case "view:toggle-file-panel": cbs.toggleFilePanel(); break;
        case "view:toggle-chat-width": cbs.toggleChatWidth(); break;
        case "view:toggle-follow": cbs.toggleFollowStream(); break;
        case "skin:terminal": cbs.setSkin("terminal"); break;
        case "skin:industrial": cbs.setSkin("industrial"); break;
        case "skin:aurora": cbs.setSkin("aurora"); break;
        case "skin:editorial": cbs.setSkin("editorial"); break;
        case "skin:glass": cbs.setSkin("glass"); break;
        case "session:new": cbs.newSession(); break;
        case "session:open-parallel": cbs.openParallelForActive(); break;
        case "help:shortcuts": cbs.openHelp(); break;
      }
    }
  }, [onClearTag]);

  return {
    isOpen,
    open,
    close,
    toggle,
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    results,
    runAction,
    register,
  };
}
