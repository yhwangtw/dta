"use client";

import { useCallback, useSyncExternalStore } from "react";

// ============================================================================
// Lightweight two-locale i18n — English default, Traditional Chinese optional.
// Same module-level-store pattern as useTheme/useToast: no context provider,
// any component (or plain function) can read the current locale.
// ============================================================================

export type Locale = "en" | "zh";

const MESSAGES = {
  // ── Top bar ──
  "topbar.search": { en: "Search…", zh: "搜尋…" },
  "topbar.searchTitle": { en: "Search sessions, tags, files, or run a command (⌘K)", zh: "搜尋 session、標籤、檔案,或執行指令 (⌘K)" },
  "topbar.hideSidebar": { en: "Hide sidebar", zh: "隱藏側欄" },
  "topbar.showSidebar": { en: "Show sidebar", zh: "顯示側欄" },
  "topbar.lightMode": { en: "Switch to light mode", zh: "切換為淺色模式" },
  "topbar.darkMode": { en: "Switch to dark mode", zh: "切換為深色模式" },
  "topbar.language": { en: "切換為繁體中文", zh: "Switch to English" },
  "topbar.export": { en: "Export", zh: "匯出" },
  "topbar.exportTitle": { en: "Export session", zh: "匯出 session" },
  "topbar.exportDisabled": { en: "Export is available after the session is saved", zh: "session 儲存後才能匯出" },
  "topbar.exportHtmlHint": { en: "Full render, open in browser", zh: "完整渲染,瀏覽器開啟" },
  "topbar.exportMdHint": { en: "Plain .md, paste into any editor", zh: "純 .md,可貼進任何編輯器" },
  "topbar.analytics": { en: "Analytics", zh: "分析" },
  "topbar.analyticsTitle": { en: "Token usage and cost report", zh: "Token 用量與成本報表" },
  "topbar.system": { en: "System", zh: "系統提示" },
  "topbar.branches": { en: "Branches", zh: "分支" },
  "input.send": { en: "Send", zh: "傳送" },
  "topbar.hideFilePanel": { en: "Hide file panel", zh: "隱藏檔案面板" },
  "topbar.showFilePanel": { en: "Show file panel", zh: "顯示檔案面板" },

  // ── Shortcuts dialog ──
  "shortcuts.title": { en: "Keyboard shortcuts", zh: "鍵盤快捷鍵" },
  "shortcuts.palette": { en: "Search & commands", zh: "搜尋與指令" },
  "shortcuts.models": { en: "Models", zh: "模型" },
  "shortcuts.skills": { en: "Skills", zh: "技能" },
  "shortcuts.sidebar": { en: "Toggle sidebar", zh: "切換側欄" },
  "shortcuts.filePanel": { en: "Toggle file panel", zh: "切換檔案面板" },
  "shortcuts.find": { en: "Find in conversation", zh: "對話內搜尋" },
  "shortcuts.turnNav": { en: "Previous / next user message", zh: "上一則 / 下一則使用者訊息" },
  "shortcuts.close": { en: "Close dialogs", zh: "關閉對話框" },

  // ── CWD picker ──
  "cwd.select": { en: "Select project…", zh: "選擇專案…" },
  "cwd.searchProjects": { en: "Search projects…", zh: "搜尋專案…" },
  "cwd.noMatches": { en: "No matching projects", zh: "沒有符合的專案" },
  "cwd.browse": { en: "Browse folders…", zh: "瀏覽資料夾…" },
  "cwd.useThis": { en: "Use this folder", zh: "用這個資料夾" },
  "cwd.back": { en: "Back", zh: "返回" },
  "cwd.noSubdirs": { en: "No subfolders", zh: "沒有子資料夾" },
  "cwd.default": { en: "Use default directory", zh: "使用預設目錄" },
  "cwd.custom": { en: "Custom path…", zh: "自訂路徑…" },
  "cwd.pin": { en: "Pin", zh: "釘選" },
  "cwd.unpin": { en: "Unpin", zh: "取消釘選" },
  "cwd.hide": { en: "Remove from list", zh: "從清單移除" },
  "cwd.switcherTitle": { en: "Switch project", zh: "切換專案" },
  "cwd.switcherPlaceholder": { en: "Search projects, worktrees — or paste a path…", zh: "搜尋專案、worktree,或貼上路徑…" },
  "cwd.pinnedGroup": { en: "Pinned", zh: "釘選" },
  "cwd.recentGroup": { en: "Recent", zh: "最近" },
  "cwd.discoveredGroup": { en: "Git repos found in ~", zh: "在 ~ 找到的 git repo" },
  "cwd.footNav": { en: "navigate", zh: "選擇" },
  "cwd.footOpen": { en: "open", zh: "開啟" },
  "cwd.footClose": { en: "close", zh: "關閉" },
  "cwd.footComplete": { en: "complete", zh: "補全" },
  "cwd.footPathHint": { en: "type / or ~ to paste a path", zh: "輸入 / 或 ~ 直接貼路徑" },

  // ── File explorer ──
  "explorer.copyPath": { en: "Copy path", zh: "複製完整路徑" },
  "explorer.copyRel": { en: "Copy relative path", zh: "複製相對路徑" },
  "explorer.mention": { en: "Insert @ mention", zh: "插入 @ 提及" },
  "explorer.diff": { en: "View diff", zh: "檢視 diff" },
  "explorer.download": { en: "Download", zh: "下載" },
  "explorer.truncated": { en: "More matches exist — refine the search", zh: "還有更多結果 — 請縮小搜尋範圍" },

  // ── Appearance panel ──
  "appearance.title": { en: "Appearance", zh: "外觀" },
  "appearance.light": { en: "Light", zh: "淺色" },
  "appearance.dark": { en: "Dark", zh: "深色" },
  "appearance.logout": { en: "Log out", zh: "登出" },

  // ── Content search panel ──
  "search.title": { en: "Search", zh: "搜尋" },
  "search.placeholder": { en: "Search in files…", zh: "在檔案中搜尋…" },
  "search.caseSensitive": { en: "Match case", zh: "區分大小寫" },
  "search.searching": { en: "Searching…", zh: "搜尋中…" },
  "search.noMatches": { en: "No matches", zh: "沒有符合的結果" },
  "search.noProject": { en: "Select a project to search", zh: "請先選擇專案再搜尋" },
  "search.error": { en: "Search failed", zh: "搜尋失敗" },
  "search.hit": { en: "match", zh: "個結果" },
  "search.hits": { en: "matches", zh: "個結果" },
  "search.files": { en: "files", zh: "個檔案" },
  "search.truncated": { en: "truncated", zh: "已截斷" },

  // ── Chat transcript ──
  "chat.retry": { en: "Retry last run", zh: "重試上一次執行" },
  "chat.ctxHigh": { en: "Context is nearly full — compact to free space", zh: "Context 快滿了 — 建議壓縮騰出空間" },
  "chat.compactNow": { en: "Compact", zh: "壓縮" },
  "chat.queueCancelAll": { en: "Cancel all", zh: "全部取消" },
  "chat.bookmark": { en: "Bookmark this message", zh: "加入書籤" },
  "chat.unbookmark": { en: "Remove bookmark", zh: "移除書籤" },
  "chat.showFull": { en: "Show full message", zh: "展開完整訊息" },
  "chat.lines": { en: "lines", zh: "行" },
  "chat.collapseMsg": { en: "Collapse message", zh: "收合訊息" },
  "toast.followOn": { en: "Always-follow output: on", zh: "自動跟隨輸出:開" },
  "toast.followOff": { en: "Always-follow output: off", zh: "自動跟隨輸出:關" },

  // ── System prompt panel ──
  "system.empty": { en: "System prompt is empty (tools are disabled)", zh: "系統提示為空(工具已停用)" },
  "system.notLoaded": { en: "Send a message to load the system prompt", zh: "傳送訊息後載入系統提示" },

  // ── Sidebar ──
  "sidebar.new": { en: "New", zh: "新增" },
  "sidebar.newIn": { en: "New session in", zh: "建立新 session 於" },
  "sidebar.refresh": { en: "Refresh", zh: "重新整理" },
  "sidebar.refreshExplorer": { en: "Refresh explorer", zh: "重新整理檔案總管" },
  "sidebar.selectProjectFirst": { en: "Select a project first", zh: "請先選擇專案" },
  "sidebar.explorer": { en: "Explorer", zh: "檔案總管" },
  "sidebar.filterFiles": { en: "Filter files…", zh: "篩選檔案…" },
  "sidebar.models": { en: "Models", zh: "模型" },
  "sidebar.skills": { en: "Skills", zh: "技能" },
  "sidebar.msg": { en: "msg", zh: "則" },
  "sidebar.msgs": { en: "msgs", zh: "則" },
  "sidebar.showArchived": { en: "Show archived", zh: "顯示封存" },
  "sidebar.hideArchived": { en: "Hide archived", zh: "隱藏封存" },
  "session.archive": { en: "Archive", zh: "封存" },
  "session.unarchive": { en: "Unarchive", zh: "取消封存" },
  "group.Today": { en: "Today", zh: "今天" },
  "group.Yesterday": { en: "Yesterday", zh: "昨天" },
  "group.This Week": { en: "This Week", zh: "本週" },
  "group.Earlier": { en: "Earlier", zh: "更早" },

  // ── Toasts ──
  "toast.sessionDeleted": { en: "Session deleted", zh: "已刪除 session" },
  "toast.tagAdded": { en: "Added", zh: "已加入" },
  "toast.tagRemoved": { en: "Removed", zh: "已移除" },
  "toast.messageNotSent": { en: "Message not sent", zh: "訊息傳送失敗" },
  "toast.commandFailed": { en: "Command failed", zh: "指令執行失敗" },
  "toast.forkFailed": { en: "Fork failed", zh: "分叉失敗" },
  "toast.steerFailed": { en: "Steer failed", zh: "插話失敗" },
  "toast.followUpFailed": { en: "Follow-up failed", zh: "追問失敗" },

  // ── Welcome / placeholders ──
  "welcome.selectSession": { en: "Select a session", zh: "選擇一個 session" },
  "welcome.chooseFromSidebar": { en: "Choose from the sidebar or start a new one", zh: "從側欄選擇,或建立新的" },
  "welcome.subtitle": { en: "Your AI coding assistant, powered by Pi", zh: "你的 AI 程式助手,由 Pi 驅動" },
  "welcome.step1": { en: "Select a project directory from the sidebar", zh: "從側欄選擇專案目錄" },
  "welcome.step2pre": { en: "Click", zh: "點擊" },
  "welcome.step2post": { en: "to start a session", zh: "開始新 session" },
  "welcome.step3pre": { en: "Configure models via", zh: "點擊底部的" },
  "welcome.step3post": { en: "at the bottom", zh: "面板設定模型" },
  "rightPanel.noFile": { en: "No file open", zh: "尚未開啟檔案" },
  "rightPanel.noFileHint": { en: "Open one from the file explorer in the sidebar", zh: "從側欄的檔案總管開啟檔案" },

  // ── tGD phases ──
  "phase.map": { en: "Understand codebase", zh: "理解程式庫" },
  "phase.define": { en: "Write PRD", zh: "撰寫 PRD" },
  "phase.plan": { en: "Break into tasks", zh: "拆解任務" },
  "phase.develop": { en: "Build features", zh: "開發功能" },
  "phase.verify": { en: "Run tests", zh: "執行測試" },
  "phase.review": { en: "Code review", zh: "程式碼審查" },
  "phase.release": { en: "Deploy", zh: "部署發布" },

  // ── Chat input ──
  "input.message": { en: "Message…", zh: "輸入訊息…" },
  "input.agentRunning": { en: "Agent is running…", zh: "Agent 執行中…" },
  "input.steerHint": { en: "Steer: interrupt & inject · Follow-up: queue after", zh: "插話:中斷並注入 · 追問:排在完成後" },

  // ── Command palette ──
  "palette.placeholder": { en: "Search sessions, tags, files, or run a command…", zh: "搜尋 session、標籤、檔案,或執行指令…" },
  "palette.sessions": { en: "Sessions", zh: "Sessions" },
  "palette.files": { en: "Files", zh: "檔案" },
  "palette.tags": { en: "Tags", zh: "標籤" },
  "palette.actions": { en: "Actions", zh: "指令" },
  "palette.navigate": { en: "navigate", zh: "移動" },
  "palette.select": { en: "select", zh: "選取" },
  "palette.close": { en: "close", zh: "關閉" },
  "palette.toggle": { en: "toggle", zh: "開關" },
} as const;

export type MsgKey = keyof typeof MESSAGES;

const listeners = new Set<() => void>();
let locale: Locale = "en";

// Read persisted preference at module load (client only; SSR keeps "en")
if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem("pi-locale");
    if (saved === "zh" || saved === "en") locale = saved;
  } catch {
    // storage unavailable — stay on default
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Locale {
  return locale;
}

function getServerSnapshot(): Locale {
  return "en";
}

export function setLocale(next: Locale): void {
  locale = next;
  try {
    localStorage.setItem("pi-locale", next);
  } catch {
    // ignore
  }
  document.documentElement.lang = next === "zh" ? "zh-Hant-TW" : "en";
  listeners.forEach((cb) => cb());
}

export function getLocale(): Locale {
  return locale;
}

/** Non-reactive translate — for toasts and other transient strings. */
export function translate(key: MsgKey): string {
  return MESSAGES[key][locale];
}

export function useI18n() {
  const loc = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const t = useCallback((key: MsgKey) => MESSAGES[key][loc], [loc]);
  return { locale: loc, setLocale, t };
}
