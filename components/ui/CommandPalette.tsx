"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import type { CommandPaletteApi, PaletteResult } from "@/hooks/useCommandPalette";
import s from "./CommandPalette.module.css";

interface Props {
  palette: CommandPaletteApi;
  /**
   * Caller-supplied handlers for the result kinds that need host state
   * (session selection, tag filter, file open). When the user runs a result
   * of one of those kinds, this fires and the palette closes.
   */
  onSelectSession?: (sessionId: string) => void;
  onSelectTag?: (tag: string) => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
}

const KIND_ICON: Record<PaletteResult["kind"], React.ReactNode> = {
  session: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  tag: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  file: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  action: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
};

const KIND_LABEL: Record<PaletteResult["kind"], string> = {
  session: "Sessions",
  tag: "Tags",
  file: "Files",
  action: "Actions",
};

/**
 * ⌘K / Ctrl+K command palette.
 *
 *  - Fuzzy search across sessions, tags, files, and built-in actions.
 *  - ↑ / ↓ to navigate, Enter to run, Esc to close.
 *  - For session/tag/file results, the host decides what to do; the palette
 *    invokes the corresponding callback and closes.
 *  - For action results, the host registers a callback registry via
 *    `palette.register(...)` (in useCommandPalette).
 */
export function CommandPalette({ palette, onSelectSession, onSelectTag, onOpenFile }: Props) {
  const { isOpen, close, query, setQuery, results, selectedIndex, setSelectedIndex, runAction } = palette;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus when opening, scroll active item into view, reset on close.
  useEffect(() => {
    if (isOpen) {
      // RAF so the modal is mounted and the input is focusable.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen]);

  // Dispatch the right host callback for the picked result, then close —
  // no host callback closes the palette itself.
  const runResult = useCallback(
    (r: PaletteResult) => {
      if (r.kind === "session") {
        const sess = r.data as { id: string };
        onSelectSession?.(sess.id);
      } else if (r.kind === "tag") {
        const tag = r.data as { tag: string };
        onSelectTag?.(tag.tag);
      } else if (r.kind === "file") {
        const f = r.data as { name: string; path: string };
        onOpenFile?.(f.path, f.name);
      } else if (r.kind === "action") {
        // Built-in actions are handled by the host via useCommandPalette's
        // runAction (wired through the registry in AppShell).
        runAction(r);
      }
      close();
    },
    [onSelectSession, onSelectTag, onOpenFile, runAction, close],
  );

  // Esc to close, ↑ ↓ to navigate, Enter to run.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (results.length === 0) return;
        setSelectedIndex((selectedIndex + 1) % results.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (results.length === 0) return;
        setSelectedIndex((selectedIndex - 1 + results.length) % results.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const r = results[selectedIndex];
        if (!r) return;
        runResult(r);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen, results, selectedIndex, setSelectedIndex, close, runResult]);

  // Scroll active item into view.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLDivElement>(`[data-cp-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Group results by kind for the section headers.
  const grouped = useMemo(() => {
    const order: PaletteResult["kind"][] = ["session", "tag", "file", "action"];
    const map: Record<PaletteResult["kind"], { r: PaletteResult; globalIdx: number }[]> = {
      session: [],
      tag: [],
      file: [],
      action: [],
    };
    results.forEach((r, i) => map[r.kind].push({ r, globalIdx: i }));
    return order.filter((k) => map[k].length > 0).map((k) => ({ kind: k, items: map[k] }));
  }, [results]);

  if (!isOpen) return null;

  return (
    <div
      className={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={s.modal}>
        <div className={s.searchRow}>
          <span className={s.searchIcon} aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={inputRef}
            className={s.input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search sessions, tags, files, or run a command…"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            aria-label="Command palette search"
          />
          <span className={s.escChip} aria-hidden>esc</span>
        </div>

        <div className={s.resultsList} ref={listRef} role="listbox">
          {results.length === 0 ? (
            <div className={s.empty}>
              {query.trim() ? `No results for "${query}"` : "Start typing to search…"}
            </div>
          ) : (
            grouped.map(({ kind, items }) => (
              <div key={kind}>
                <div className={s.section}>{KIND_LABEL[kind]}</div>
                {items.map(({ r, globalIdx }) => {
                  const isActive = globalIdx === selectedIndex;
                  return (
                    <div
                      key={r.id}
                      data-cp-index={globalIdx}
                      role="option"
                      aria-selected={isActive}
                      className={`${s.item} ${isActive ? s.itemActive : ""}`}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      onMouseDown={(e) => {
                        // onMouseDown so it fires before input blur and steals focus back
                        e.preventDefault();
                        runResult(r);
                      }}
                    >
                      <span className={s.itemIcon} aria-hidden>{KIND_ICON[kind]}</span>
                      <div className={s.itemBody}>
                        <div className={s.itemTitle}>{r.title}</div>
                        {r.subtitle && <div className={s.itemSubtitle}>{r.subtitle}</div>}
                      </div>
                      {r.hint && <span className={s.itemHint}>{r.hint}</span>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className={s.footer}>
          <div className={s.footerLeft}>
            <span className={s.footerHint}>
              <span className={s.kbd}>↑</span><span className={s.kbd}>↓</span> navigate
            </span>
            <span className={s.footerHint}>
              <span className={s.kbd}>↵</span> select
            </span>
            <span className={s.footerHint}>
              <span className={s.kbd}>esc</span> close
            </span>
          </div>
          <div className={s.footerLeft}>
            <span className={s.footerHint}>
              <span className={s.kbd}>⌘K</span> toggle
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
