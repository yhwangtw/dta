"use client";

import { useState, useRef, useEffect } from "react";
import { MarkdownBody } from "./MarkdownBody";
import type {
  UserMessage,
  ImageContent,
  TextContent,
} from "@/lib/types";
import styles from "./UserMessageView.module.css";

function formatTime(ts?: number): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  return `${date} ${time}`;
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  } catch {
    return Promise.reject();
  }
}

export function UserMessageView({ message, entryId, onFork, forking, prevAssistantEntryId, onEditRerun }: {
  message: UserMessage;
  entryId?: string;
  onFork?: (entryId: string) => void;
  forking?: boolean;
  /** @deprecated superseded by inline edit (onEditRerun); still accepted for compat */
  onNavigate?: (entryId: string) => void;
  prevAssistantEntryId?: string;
  /** @deprecated superseded by inline edit (onEditRerun) */
  onEditContent?: (content: string) => void;
  onEditRerun?: (prevAssistantEntryId: string | undefined, newText: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const content =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((b): b is TextContent => b.type === "text")
          .map((b) => b.text)
          .join("\n");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const editRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) return;
    const ta = editRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [editing]);

  const startEdit = () => { setDraft(content); setEditing(true); };
  const commitEdit = () => {
    const text = draft.trim();
    if (!text) return;
    setEditing(false);
    onEditRerun?.(prevAssistantEntryId, text);
  };

  const imageBlocks: ImageContent[] =
    typeof message.content === "string"
      ? []
      : message.content.filter((b): b is ImageContent => b.type === "image");

  const time = formatTime(message.timestamp);
  const canFork = !!entryId && !!onFork;
  const canEdit = !!prevAssistantEntryId && !!onEditRerun;

  const copyContent = () => {
    copyText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className={`hover-group ${styles.root}`}
    >
      <div className={styles.messageRow}>
        {editing ? (
          <div className={styles.editBox}>
            <textarea
              ref={editRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitEdit(); }
              }}
              className={styles.editTextarea}
              spellCheck={false}
            />
            <div className={styles.editActions}>
              <span className={styles.editHint}>Re-runs from here — later turns are replaced</span>
              <button onClick={() => setEditing(false)} className={styles.editCancel}>Cancel</button>
              <button onClick={commitEdit} disabled={!draft.trim()} className={styles.editRerunBtn}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Rerun
              </button>
            </div>
          </div>
        ) : (
        <div
          className={styles.bubble}
        >
          {imageBlocks.length > 0 && (
            <div className={content ? styles.imageGrid : styles.imageGridNoMargin}>
              {imageBlocks.map((img, i) => {
                // lib/types.ts ImageContent uses {source:{type,data,media_type,url}}
                // pi-ai on-disk format uses flat {data, mimeType} — handle both
                const flat = img as unknown as { data?: string; mimeType?: string };
                const src = img.source
                  ? img.source.type === "base64"
                    ? `data:${img.source.media_type};base64,${img.source.data}`
                    : img.source.url ?? ""
                  : flat.data
                    ? `data:${flat.mimeType};base64,${flat.data}`
                    : "";
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className={styles.image}
                  />
                );
              })}
            </div>
          )}
          {content && <MarkdownBody className="markdown-user-message">{content}</MarkdownBody>}
        </div>
        )}

      </div>

      {/* Bottom row: action buttons + timestamp (hidden while editing) */}
      {!editing && (
        <div className={styles.bottomRow}>
          <div className={`hover-reveal ${styles.actionButtons}`}>
            <button
              onClick={copyContent}
              title="Copy message"
              className={`${styles.actionButton} ${copied ? "text-accent" : "text-dim hover-accent"}`}
            >
              {copied ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {(canFork || canEdit) && (
            <div className={`${forking ? "" : "hover-reveal"} ${styles.actionButtons}`}>
              {canEdit && (
                <button
                  onClick={startEdit}
                  title="Edit this message and re-run from here — branches within this session"
                  className={`${styles.actionButton} text-dim hover-accent`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                  Edit
                </button>
              )}
              {canFork && (
                <button
                  onClick={() => { onFork!(entryId!); }}
                  disabled={forking}
                  title={forking ? "Creating new session…" : "New session — creates an independent copy from here"}
                  className={`${styles.actionButton} ${forking ? "text-accent" : "text-dim hover-accent"}`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  {forking ? "Creating…" : "New session"}
                </button>
              )}
            </div>
          )}
          {time && <span className={styles.timestamp}>{time}</span>}
        </div>
      )}
    </div>
  );
}
