"use client";

import { useState, useEffect, useCallback, useMemo, type RefObject } from "react";
import { shortenCwd } from "./session-utils";
import styles from "./CwdPicker.module.css";
import { useI18n } from "@/lib/i18n";

const PINS_KEY = "pi-cwd-pins";
const HIDDEN_KEY = "pi-cwd-hidden";

function loadList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveList(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // storage unavailable — session-only
  }
}

interface CwdPickerState {
  selectedCwd: string | null;
  homeDir: string;
  dropdownOpen: boolean;
  customPathOpen: boolean;
  customPathValue: string;
  customPathError: string | null;
  customPathValidating: boolean;
}

interface CwdPickerActions {
  setDropdownOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setCustomPathOpen: (v: boolean) => void;
  setCustomPathValue: (v: string) => void;
  setCustomPathError: (v: string | null) => void;
  setSelectedCwd: (cwd: string) => void;
  commitCustomPath: () => Promise<void>;
  handleDefaultCwd: () => Promise<void>;
}

interface CwdPickerRefs {
  customPathInputRef: RefObject<HTMLInputElement | null>;
  dropdownRef: RefObject<HTMLDivElement | null>;
}

export interface ProjectEntry {
  cwd: string;
  count: number;
}

interface CwdPickerProps {
  state: CwdPickerState;
  actions: CwdPickerActions;
  refs: CwdPickerRefs;
  /** All known project cwds with session counts, most recent first. */
  projects: ProjectEntry[];
  initialSessionId: string | null;
  isRestoring: boolean;
}

interface BrowseState {
  path: string;
  parent: string | null;
  home: string;
  dirs: string[];
}

const lastSegment = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

export function CwdPicker({ state, actions, refs, projects, initialSessionId, isRestoring }: CwdPickerProps) {
  const {
    selectedCwd, homeDir, dropdownOpen,
    customPathOpen, customPathValue, customPathError, customPathValidating,
  } = state;
  const {
    setDropdownOpen, setCustomPathOpen, setCustomPathValue, setCustomPathError,
    setSelectedCwd, commitCustomPath, handleDefaultCwd,
  } = actions;
  const { customPathInputRef, dropdownRef } = refs;
  const { t } = useI18n();

  // ── Project list: filter + pins + hidden ─────────────────────────────────
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [pins, setPins] = useState<string[]>(() => loadList(PINS_KEY));
  const [hidden, setHidden] = useState<string[]>(() => loadList(HIDDEN_KEY));

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hiddenSet = new Set(hidden);
    const list = projects.filter(
      (p) => !hiddenSet.has(p.cwd) && (!q || p.cwd.toLowerCase().includes(q)),
    );
    const pinRank = new Map(pins.map((cwd, i) => [cwd, i]));
    return [...list].sort((a, b) => {
      const pa = pinRank.has(a.cwd) ? pinRank.get(a.cwd)! : Infinity;
      const pb = pinRank.has(b.cwd) ? pinRank.get(b.cwd)! : Infinity;
      return pa - pb; // pinned first (stable sort keeps recency order otherwise)
    });
  }, [projects, query, pins, hidden]);

  useEffect(() => setActiveIdx(0), [query, dropdownOpen]);

  const togglePin = useCallback((cwd: string) => {
    setPins((prev) => {
      const next = prev.includes(cwd) ? prev.filter((c) => c !== cwd) : [...prev, cwd];
      saveList(PINS_KEY, next);
      return next;
    });
  }, []);

  const hideProject = useCallback((cwd: string) => {
    setHidden((prev) => {
      const next = prev.includes(cwd) ? prev : [...prev, cwd];
      saveList(HIDDEN_KEY, next);
      return next;
    });
  }, []);

  const pickProject = useCallback((cwd: string) => {
    setSelectedCwd(cwd);
    setCustomPathOpen(false);
    setCustomPathValue("");
    setCustomPathError(null);
    setDropdownOpen(false);
    setQuery("");
  }, [setSelectedCwd, setCustomPathOpen, setCustomPathValue, setCustomPathError, setDropdownOpen]);

  // ── Browse mode ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"list" | "browse">("list");
  const [browse, setBrowse] = useState<BrowseState | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);

  const fetchBrowse = useCallback(async (path: string) => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const res = await fetch("/api/cwd/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await res.json() as BrowseState & { error?: string };
      if (!res.ok || data.error) {
        setBrowseError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setBrowse(data);
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : String(e));
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  const openBrowse = useCallback(() => {
    setMode("browse");
    void fetchBrowse(selectedCwd ?? "~");
  }, [fetchBrowse, selectedCwd]);

  // Reset transient state when the dropdown closes (incl. outside click).
  useEffect(() => {
    if (!dropdownOpen) {
      setMode("list");
      setQuery("");
      setBrowseError(null);
    }
  }, [dropdownOpen]);

  // ── Custom-path autocomplete ─────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!customPathOpen || !customPathValue.trim()) {
      setSuggestions([]);
      return;
    }
    const value = customPathValue;
    const timer = setTimeout(async () => {
      const slash = value.lastIndexOf("/");
      const parent = slash <= 0 ? (value.startsWith("~") ? "~" : "/") : value.slice(0, slash);
      const prefix = value.slice(slash + 1).toLowerCase();
      try {
        const res = await fetch("/api/cwd/browse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: parent }),
        });
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = await res.json() as BrowseState;
        const base = data.path === "/" ? "/" : `${data.path}/`;
        setSuggestions(
          data.dirs
            .filter((n) => n.toLowerCase().startsWith(prefix))
            .slice(0, 6)
            .map((n) => base + n),
        );
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [customPathValue, customPathOpen]);

  const completeTo = useCallback((path: string) => {
    setCustomPathValue(`${path}/`);
    setCustomPathError(null);
    customPathInputRef.current?.focus();
  }, [setCustomPathValue, setCustomPathError, customPathInputRef]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div ref={dropdownRef} className={styles.root}>
      <button
        onClick={() => setDropdownOpen((v: boolean) => !v)}
        className={selectedCwd ? styles.mainButtonSelected : styles.mainButtonDefault}
      >
        <span
          className={selectedCwd ? styles.pathSpanSelected : styles.pathSpanDefault}
          title={selectedCwd ?? ""}
        >
          {selectedCwd ? shortenCwd(selectedCwd, homeDir) : (initialSessionId && !isRestoring ? "" : t("cwd.select"))}
        </span>
      </button>

      {dropdownOpen && mode === "browse" && (
        <div className={styles.dropdown}>
          <div className={styles.browseHeader}>
            <button
              onClick={() => browse?.parent && void fetchBrowse(browse.parent)}
              disabled={!browse?.parent || browseLoading}
              className={styles.browseNavBtn}
              title=".."
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button
              onClick={() => browse && void fetchBrowse(browse.home)}
              disabled={browseLoading}
              className={styles.browseNavBtn}
              title="~"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
            </button>
            <span className={styles.browsePath} title={browse?.path ?? ""}>
              {browse ? shortenCwd(browse.path, homeDir) : "…"}
            </span>
          </div>
          <div className={styles.browseList}>
            {browseError && <div className={styles.customPathError}>{browseError}</div>}
            {!browseError && browse?.dirs.length === 0 && (
              <div className={styles.emptyNote}>{t("cwd.noSubdirs")}</div>
            )}
            {!browseError && browse?.dirs.map((name) => (
              <button
                key={name}
                onClick={() => void fetchBrowse(browse.path === "/" ? `/${name}` : `${browse.path}/${name}`)}
                className={styles.browseDir}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={styles.flexShrink0}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className={styles.cwdText}>{name}</span>
              </button>
            ))}
          </div>
          <div className={styles.customPathButtons + " " + styles.browseFooter}>
            <button
              onClick={() => browse && pickProject(browse.path)}
              disabled={!browse || browseLoading}
              className={styles.openButton}
            >
              {t("cwd.useThis")}
            </button>
            <button onClick={() => setMode("list")} className={styles.cancelButton}>
              {t("cwd.back")}
            </button>
          </div>
        </div>
      )}

      {dropdownOpen && mode === "list" && (
        <div className={styles.dropdown}>
          {projects.length > 3 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIdx((i) => Math.min(i + 1, visibleProjects.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIdx((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const target = visibleProjects[activeIdx];
                  if (target) pickProject(target.cwd);
                } else if (e.key === "Escape") {
                  setDropdownOpen(false);
                }
              }}
              placeholder={t("cwd.searchProjects")}
              className={styles.searchInput}
              autoFocus
              spellCheck={false}
            />
          )}

          <div className={styles.projectList}>
            {visibleProjects.length === 0 && query && (
              <div className={styles.emptyNote}>{t("cwd.noMatches")}</div>
            )}
            {visibleProjects.map((p, i) => {
              const isSelected = p.cwd === selectedCwd;
              const isPinned = pins.includes(p.cwd);
              return (
                <div
                  key={p.cwd}
                  onClick={() => pickProject(p.cwd)}
                  className={`${isSelected ? styles.projectRowSelected : styles.projectRow} ${i === activeIdx ? styles.projectRowActive : ""}`}
                  title={p.cwd}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className={styles.projectText}>
                    <span className={styles.projectName}>
                      {isPinned && <span className={styles.pinDot} aria-hidden>★ </span>}
                      {lastSegment(p.cwd)}
                    </span>
                    <span className={styles.projectPath}>{shortenCwd(p.cwd, homeDir)}</span>
                  </span>
                  <span className={styles.countChip}>{p.count}</span>
                  <span className={styles.rowActions}>
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(p.cwd); }}
                      className={styles.rowActionBtn}
                      title={isPinned ? t("cwd.unpin") : t("cwd.pin")}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                    </button>
                    {!isSelected && (
                      <button
                        onClick={(e) => { e.stopPropagation(); hideProject(p.cwd); }}
                        className={styles.rowActionBtn}
                        title={t("cwd.hide")}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); openBrowse(); }}
            className={visibleProjects.length > 0 ? styles.dropdownButtonWithBorder : styles.dropdownButton}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.flexShrink0}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>{t("cwd.browse")}</span>
          </button>

          {!customPathOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); void handleDefaultCwd(); }}
              className={styles.dropdownButton}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" className={styles.flexShrink0}>
                <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
              </svg>
              <span>{t("cwd.default")}</span>
            </button>
          )}

          {!customPathOpen ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCustomPathOpen(true);
                setCustomPathError(null);
                setTimeout(() => customPathInputRef.current?.focus(), 0);
              }}
              className={styles.dropdownButton}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" className={styles.flexShrink0}>
                <line x1="5" y1="1" x2="5" y2="9" />
                <line x1="1" y1="5" x2="9" y2="5" />
              </svg>
              <span>{t("cwd.custom")}</span>
            </button>
          ) : (
            <div className={styles.customPathContainer}>
              <input
                ref={customPathInputRef}
                value={customPathValue}
                onChange={(e) => {
                  setCustomPathValue(e.target.value);
                  setCustomPathError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitCustomPath();
                  }
                  if (e.key === "Tab" && suggestions.length > 0) {
                    e.preventDefault();
                    completeTo(suggestions[0]);
                  }
                  if (e.key === "Escape") {
                    setCustomPathOpen(false);
                    setCustomPathValue("");
                    setCustomPathError(null);
                  }
                }}
                placeholder="/path/to/project"
                className={styles.customPathInput}
              />
              {suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => completeTo(s)} className={styles.suggestion} title={s}>
                      {shortenCwd(s, homeDir)}
                    </button>
                  ))}
                  <div className={styles.suggestHint}>Tab ↹</div>
                </div>
              )}
              {customPathError && (
                <div className={styles.customPathError}>
                  {customPathError}
                </div>
              )}
              <div className={styles.customPathButtons}>
                <button
                  onClick={() => void commitCustomPath()}
                  disabled={customPathValidating || !customPathValue.trim()}
                  className={styles.openButton}
                >
                  {customPathValidating ? "Checking…" : "Open"}
                </button>
                <button
                  onClick={() => { setCustomPathOpen(false); setCustomPathValue(""); setCustomPathError(null); }}
                  className={styles.cancelButton}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
