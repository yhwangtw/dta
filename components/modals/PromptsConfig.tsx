"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrompts } from "@/hooks/usePrompts";
import styles from "./PromptsConfig.module.css";

export function PromptsConfig({ onClose }: { onClose: () => void }) {
  const { prompts, savePrompt, deletePrompt } = usePrompts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const resetForm = useCallback(() => { setEditingId(null); setName(""); setBody(""); }, []);

  const startEdit = useCallback((id: string) => {
    const p = prompts.find((x) => x.id === id);
    if (!p) return;
    setEditingId(p.id);
    setName(p.name);
    setBody(p.body);
  }, [prompts]);

  const save = useCallback(async () => {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    await savePrompt({ id: editingId ?? undefined, name, body });
    setSaving(false);
    resetForm();
  }, [name, body, editingId, savePrompt, resetForm]);

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="prompt-templates-title">
        <div className={styles.header}>
          <span className={styles.title} id="prompt-templates-title">Prompt templates</span>
          <button onClick={onClose} className={styles.closeButton} aria-label="Close">×</button>
        </div>

        <div className={styles.body}>
          {/* Editor */}
          <div className={styles.editor}>
            <div className={styles.nameRow}>
              <span className={styles.slash}>/</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="name"
                aria-label="Template name"
                className={styles.nameInput}
                spellCheck={false}
              />
              <span className={styles.nameHint}>type <code>/{name.trim() ? name.trim().toLowerCase().replace(/\s+/g, "-") : "name"}</code> in the composer to insert</span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Template body — inserted into the composer when you pick it"
              aria-label="Template body"
              className={styles.bodyInput}
              rows={5}
              spellCheck={false}
            />
            <div className={styles.editorActions}>
              {editingId && (
                <button onClick={resetForm} className={styles.cancelBtn}>Cancel edit</button>
              )}
              <button onClick={save} disabled={saving || !name.trim() || !body.trim()} className={styles.saveBtn}>
                {editingId ? "Save changes" : "Add template"}
              </button>
            </div>
          </div>

          {/* List */}
          <div className={styles.list}>
            {prompts.length === 0 ? (
              <div className={styles.empty}>No templates yet. Add one above, then type <code>/name</code> in the chat composer.</div>
            ) : (
              prompts.map((p) => (
                <div key={p.id} className={`${styles.item} ${editingId === p.id ? styles.itemEditing : ""}`}>
                  <div className={styles.itemMain}>
                    <span className={styles.itemName}>/{p.name}</span>
                    <span className={styles.itemBody}>{p.body.split("\n")[0]}</span>
                  </div>
                  <div className={styles.itemActions}>
                    <button onClick={() => startEdit(p.id)} className={styles.itemBtn} title="Edit">Edit</button>
                    <button onClick={() => { if (editingId === p.id) resetForm(); void deletePrompt(p.id); }} className={`${styles.itemBtn} ${styles.itemBtnDanger}`} title="Delete">Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
