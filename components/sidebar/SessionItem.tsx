"use client";

import { useState, useCallback, useRef } from "react";
import type { SessionInfo } from "@/lib/types";
import { formatRelativeTime } from "./session-utils";
import styles from "./SessionItem.module.css";

interface SessionItemProps {
  session: SessionInfo;
  isSelected: boolean;
  onClick: () => void;
  onRenamed?: () => void;
  onDeleted?: (id: string) => void;
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isPinned?: boolean;
  onPinToggle?: (id: string) => void;
  tags?: string[];
  onSetTag?: (tag: string) => void;
  onRemoveTag?: (tag: string) => void;
  isParallelOpen?: boolean;
  onOpenParallel?: (session: SessionInfo) => void;
}

export function SessionItem({
  session,
  isSelected,
  onClick,
  onRenamed,
  onDeleted,
  depth = 0,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
  isPinned = false,
  onPinToggle,
  tags = [],
  onSetTag,
  onRemoveTag,
  isParallelOpen = false,
  onOpenParallel,
}: SessionItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tagInputValue, setTagInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const title = session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12);

  const startRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(session.name ?? "");
    setRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [session.name]);

  const commitRename = useCallback(async () => {
    const name = renameValue.trim();
    setRenaming(false);
    if (name === (session.name ?? "")) return;
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onRenamed?.();
    } catch {
      // ignore
    }
  }, [renameValue, session.id, session.name, onRenamed]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  }, []);

  const handleDeleteConfirm = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
      onDeleted?.(session.id);
    } catch {
      setDeleting(false);
    }
  }, [session.id, onDeleted]);

  const handleDeleteCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  const handlePinClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onPinToggle?.(session.id);
  }, [onPinToggle, session.id]);

  const handleTagClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setTagInputOpen((v) => !v);
    setTimeout(() => tagInputRef.current?.focus(), 0);
  }, []);

  const handleTagSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const v = tagInputValue.trim();
    if (v && onSetTag) onSetTag(v);
    setTagInputValue("");
    setTagInputOpen(false);
  }, [tagInputValue, onSetTag]);

  const handleTagRemove = useCallback((e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    onRemoveTag?.(tag);
  }, [onRemoveTag]);

  const handleParallelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenParallel?.(session);
  }, [onOpenParallel, session]);

  // Min height for normal view; auto-grows when tags are present
  const ITEM_HEIGHT = 54;

  return (
    <div
      onClick={confirmDelete || renaming ? undefined : onClick}
      className={["hover-group", !confirmDelete && !isSelected ? "hover-bg" : "", styles.item].filter(Boolean).join(" ")}
      style={{
        minHeight: ITEM_HEIGHT,
        paddingLeft: depth > 0 ? depth * 12 + 14 : 14,
        cursor: confirmDelete || renaming ? "default" : "pointer",
        background: confirmDelete
          ? "var(--color-error-bg)"
          : isSelected ? "var(--bg-selected)" : undefined,
        borderLeft: confirmDelete
          ? "2px solid var(--color-error)"
          : isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        opacity: deleting ? 0.5 : 1,
        flexDirection: "column",
        alignItems: "stretch",
        height: "auto",
      }}
    >
      {confirmDelete ? (
        /* ── Delete confirmation: same height, two flat buttons ── */
        <>
          <div className={styles.deleteText}>
            Delete <span className={styles.deleteTextBold}>&ldquo;{title.slice(0, 22)}{title.length > 22 ? "…" : ""}&rdquo;</span>?
          </div>
          <div className={styles.deleteActions}>
            <button
              onClick={handleDeleteConfirm}
              className={styles.deleteConfirmButton}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              Delete
            </button>
            <button
              onClick={handleDeleteCancel}
              className={styles.cancelButton}
            >
              Cancel
            </button>
          </div>
        </>
      ) : renaming ? (
        /* ── Rename: input fills the same row ── */
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          autoFocus
          className={styles.renameInput}
        />
      ) : (
        /* ── Normal view ── */
        <>
          {/* Fork indicator for child sessions */}
          {depth > 0 && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.forkIndicator}>
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          )}
          <div className={styles.contentWrapper}>
            <div
              className={`${styles.sessionTitle} ${isSelected ? styles.sessionTitleSelected : styles.sessionTitleDefault}`}
              title={title}
            >
              {title}
            </div>
            <div className={styles.sessionMeta}>
              <span title={session.modified}>{formatRelativeTime(session.modified)}</span>
              <span>{session.messageCount} msgs</span>
              {tags.slice(0, 3).map((t) => (
                <span key={t} className={styles.tagInline}>
                  #{t}
                </span>
              ))}
            </div>
          </div>

          {/* Collapse toggle — always visible when has children */}
          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
              title={collapsed ? "Expand forks" : "Collapse forks"}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand forks" : "Collapse forks"}
              className={`${styles.collapseToggle} ${collapsed ? styles.collapseToggleCollapsed : styles.collapseToggleExpanded}`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2 3.5 5 6.5 8 3.5" />
              </svg>
            </button>
          )}

          {/* Action buttons — shown on hover. Pin first (benign state toggle),
              then rename (edit), then delete (destructive — kept last). */}
            <div className={`hover-reveal ${styles.hoverActions}`}>
              <button
                onClick={handlePinClick}
                title={isPinned ? "Unpin session" : "Pin session"}
                aria-label={isPinned ? "Unpin session" : "Pin session"}
                aria-pressed={isPinned}
                className={`hover-bg-selected-accent ${styles.actionButton} ${isPinned ? styles.actionButtonActive : ""}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
              <button
                onClick={handleTagClick}
                title="Add tag"
                aria-label="Add tag"
                className={`hover-bg-selected-accent ${styles.actionButton} ${tagInputOpen ? styles.actionButtonActive : ""}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
              </button>
              <button
                onClick={handleParallelClick}
                title={isParallelOpen ? "Already open in parallel view" : "Open in parallel view"}
                aria-label="Open in parallel view"
                className={`hover-bg-selected-accent ${styles.actionButton} ${isParallelOpen ? styles.actionButtonActive : ""}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="12" y1="3" x2="12" y2="21" />
                </svg>
              </button>
              <button
                onClick={startRename}
                title="Rename"
                className={`hover-bg-selected-accent ${styles.actionButton}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
              <button
                onClick={handleDeleteClick}
                title="Delete"
                className={`hover-bg-error-border ${styles.actionButton}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
            {(tagInputOpen || tags.length > 0) && (
              <div className={styles.tagRow} onClick={(e) => e.stopPropagation()}>
                {tags.map((t) => (
                  <span key={t} className={styles.tagChip}>
                    #{t}
                    {onRemoveTag && (
                      <button
                        onClick={(e) => handleTagRemove(e, t)}
                        className={styles.tagChipRemove}
                        title={`Remove #${t}`}
                      >×</button>
                    )}
                  </span>
                ))}
                {tagInputOpen && (
                  <form onSubmit={handleTagSubmit} className={styles.tagForm}>
                    <input
                      ref={tagInputRef}
                      value={tagInputValue}
                      onChange={(e) => setTagInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setTagInputOpen(false);
                          setTagInputValue("");
                        }
                      }}
                      onBlur={() => { if (!tagInputValue) setTagInputOpen(false); }}
                      placeholder="add tag…"
                      className={styles.tagInput}
                      maxLength={32}
                    />
                  </form>
                )}
              </div>
            )}
        </>
      )}
    </div>
  );
}
