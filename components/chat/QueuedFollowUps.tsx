"use client";

import { useState, type KeyboardEvent } from "react";
import type { QueuedFollowUp } from "@/lib/queued-follow-ups";
import { useI18n } from "@/lib/i18n";
import styles from "./QueuedFollowUps.module.css";

interface Props {
  items: QueuedFollowUp[];
  busy: boolean;
  wide?: boolean;
  onRemove: (id: string) => Promise<boolean>;
  onUpdate: (id: string, message: string) => Promise<boolean>;
  onMove: (id: string, direction: -1 | 1) => Promise<boolean>;
  onClear: () => Promise<boolean>;
}

export function QueuedFollowUps({ items, busy, wide, onRemove, onUpdate, onMove, onClear }: Props) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (items.length === 0) return null;

  const beginEdit = (item: QueuedFollowUp) => {
    setEditingId(item.id);
    setDraft(item.message);
  };

  const saveEdit = async () => {
    if (!editingId || !draft.trim() || busy) return;
    if (await onUpdate(editingId, draft)) {
      setEditingId(null);
      setDraft("");
    }
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditingId(null);
      setDraft("");
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void saveEdit();
    }
  };

  return (
    <div className={styles.outer}>
      <section className={`${styles.panel} ${wide ? styles.panelWide : ""}`} aria-label={t("chat.queueTitle")} aria-busy={busy}>
        <header className={styles.header}>
          <div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            <strong>{t("chat.queueTitle")}</strong>
            <span>{items.length}</span>
          </div>
          {busy ? <span className={styles.updating}>{t("chat.queueUpdating")}</span> : (
            <button type="button" className={styles.clearButton} onClick={() => void onClear()}>{t("chat.queueCancelAll")}</button>
          )}
        </header>

        <ol className={styles.list}>
          {items.map((item, index) => (
            <li className={styles.item} key={item.id}>
              <span className={styles.position} aria-hidden>{index + 1}</span>
              {editingId === item.id ? (
                <div className={styles.editor}>
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleEditKeyDown}
                    aria-label={t("chat.queueEdit")}
                    rows={2}
                    disabled={busy}
                  />
                  <div>
                    <button type="button" onClick={() => { setEditingId(null); setDraft(""); }} disabled={busy}>{t("agents.cancel")}</button>
                    <button type="button" className={styles.saveButton} onClick={() => void saveEdit()} disabled={busy || !draft.trim()}>{t("chat.queueSave")}</button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" className={styles.message} onClick={() => beginEdit(item)} title={item.message || t("chat.queueEdit")} disabled={busy}>
                    <span>{item.message || t("input.attachImage")}</span>
                    {!!item.images?.length && <small>{item.images.length} {t("chat.queueImages")}</small>}
                  </button>
                  <div className={styles.actions}>
                    <button type="button" onClick={() => void onMove(item.id, -1)} disabled={busy || index === 0} aria-label={t("chat.queueMoveUp")} title={t("chat.queueMoveUp")}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m18 15-6-6-6 6" /></svg>
                    </button>
                    <button type="button" onClick={() => void onMove(item.id, 1)} disabled={busy || index === items.length - 1} aria-label={t("chat.queueMoveDown")} title={t("chat.queueMoveDown")}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                    <button type="button" onClick={() => beginEdit(item)} disabled={busy} aria-label={t("chat.queueEdit")} title={t("chat.queueEdit")}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    </button>
                    <button type="button" onClick={() => void onRemove(item.id)} disabled={busy} aria-label={t("chat.queueRemove")} title={t("chat.queueRemove")}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
