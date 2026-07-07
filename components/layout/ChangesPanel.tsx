"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/useToast";
import s from "./ChangesPanel.module.css";

interface ChangedFile {
  path: string;
  status: string;
  additions: number | null;
  deletions: number | null;
}

interface Snapshot {
  id: string;
  ts: number;
  label: string;
  fileCount: number;
}

interface Props {
  cwd: string | null;
  sessionId?: string | null;
  /** Re-fetch when this changes (bumped after each agent turn). */
  refreshKey?: number;
  onOpenDiff: (path: string) => void;
  selectedPath?: string | null;
}

function snapTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

const STATUS_CLASS: Record<string, string> = {
  M: "statusM",
  A: "statusA",
  D: "statusD",
  R: "statusR",
  "??": "statusU",
};

/**
 * Working-tree changes for the session cwd — the "what did the agent just
 * touch" view. Click a file to open its HEAD↔worktree diff.
 */
export function ChangesPanel({ cwd, sessionId, refreshKey, onOpenDiff, selectedPath }: Props) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [branch, setBranch] = useState<string | null>(null);
  const [isGit, setIsGit] = useState(true);
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapsOpen, setSnapsOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/git/changes?cwd=${encodeURIComponent(cwd)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { git: boolean; branch: string | null; files: ChangedFile[] };
      setIsGit(d.git);
      setBranch(d.branch);
      setFiles(d.files ?? []);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  const loadSnapshots = useCallback(async () => {
    if (!cwd || !sessionId) { setSnapshots([]); return; }
    try {
      const res = await fetch(`/api/git/snapshots?cwd=${encodeURIComponent(cwd)}&sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const d = await res.json() as { git: boolean; snapshots: Snapshot[] };
      setSnapshots(d.snapshots ?? []);
    } catch {
      setSnapshots([]);
    }
  }, [cwd, sessionId]);

  useEffect(() => {
    load();
    loadSnapshots();
  }, [load, loadSnapshots, refreshKey]);

  const restore = useCallback(async (snap: Snapshot) => {
    if (!cwd || !sessionId) return;
    if (!window.confirm(`Restore files to "${snap.label}" (${snapTime(snap.ts)})?\n\nFiles changed since then are reverted; files created since are removed. This cannot be undone.`)) return;
    setRestoringId(snap.id);
    try {
      const res = await fetch("/api/git/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, sessionId, id: snap.id }),
      });
      const d = await res.json() as { ok?: boolean; restored?: number; removed?: number; error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      showToast(`Restored ${d.restored ?? 0} file(s)${d.removed ? `, removed ${d.removed}` : ""}`, { type: "success" });
      await load();
    } catch (e) {
      showToast(`Restore failed: ${e instanceof Error ? e.message : e}`, { type: "error" });
    } finally {
      setRestoringId(null);
    }
  }, [cwd, sessionId, showToast, load]);

  if (!cwd) {
    return <div className={s.empty}>{t("sidebar.selectProjectFirst")}</div>;
  }

  return (
    <div className={s.container}>
      <div className={`${s.header} chrome-mono`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        <span className={s.branch} title={branch ?? undefined}>{branch ?? "—"}</span>
        <span className={s.count}>{files.length}</span>
        <button onClick={load} title="Refresh" className={s.refresh} disabled={loading}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? s.spinning : undefined}>
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {!isGit ? (
        <div className={s.empty}>Not a git repository</div>
      ) : files.length === 0 ? (
        <div className={s.empty}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>Working tree clean</span>
        </div>
      ) : (
        <div className={s.list}>
          {files.map((f) => (
            <button
              key={f.path}
              onClick={() => onOpenDiff(f.path)}
              className={`${s.item} ${selectedPath === f.path ? s.itemSelected : ""}`}
              title={f.path}
            >
              <span className={`${s.status} ${s[STATUS_CLASS[f.status] ?? "statusM"]} chrome-mono`}>
                {f.status === "??" ? "U" : f.status.slice(0, 1)}
              </span>
              <span className={s.path}>{f.path}</span>
              {(f.additions !== null || f.deletions !== null) && (
                <span className={`${s.stat} chrome-mono`}>
                  {f.additions !== null && <span className={s.add}>+{f.additions}</span>}
                  {f.deletions !== null && <span className={s.del}>−{f.deletions}</span>}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Restore points — snapshots captured before each agent run */}
      {isGit && sessionId && snapshots.length > 0 && (
        <div className={s.snapSection}>
          <button
            className={`${s.snapHeader} chrome-mono`}
            onClick={() => setSnapsOpen((v) => !v)}
            aria-expanded={snapsOpen}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={snapsOpen ? s.caretOpen : s.caretClosed}>
              <polyline points="2 3.5 5 6.5 8 3.5" />
            </svg>
            <span>Restore points</span>
            <span className={s.count}>{snapshots.length}</span>
          </button>
          {snapsOpen && (
            <div className={s.snapList}>
              {snapshots.map((snap) => (
                <div key={snap.id} className={s.snapItem}>
                  <div className={s.snapMain}>
                    <span className={s.snapLabel} title={snap.label}>{snap.label}</span>
                    <span className={`${s.snapMeta} chrome-mono`}>{snapTime(snap.ts)} · {snap.fileCount} changed</span>
                  </div>
                  <button
                    onClick={() => restore(snap)}
                    disabled={restoringId !== null}
                    className={s.snapRestore}
                    title="Revert the working tree to this point"
                  >
                    {restoringId === snap.id ? "…" : "Restore"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
