"use client";

import { useEffect, useState } from "react";
import { DiffViewMode } from "./text-viewer/DiffViewMode";
import { getLanguage } from "@/lib/file-mime";
import s from "./DiffPanel.module.css";

interface Props {
  cwd: string;
  path: string;
  onClose: () => void;
}

/**
 * HEAD ↔ working-tree diff for one file, shown in the right panel when a
 * file is picked from the Changes view.
 */
export function DiffPanel({ cwd, path, onClose }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "tooLarge" }
    | { kind: "ready"; oldText: string; newText: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/git/file-diff?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json() as { oldText?: string; newText?: string; tooLarge?: boolean; error?: string };
        if (cancelled) return;
        if (d.error) setState({ kind: "error", message: d.error });
        else if (d.tooLarge) setState({ kind: "tooLarge" });
        else setState({ kind: "ready", oldText: d.oldText ?? "", newText: d.newText ?? "" });
      } catch (e) {
        if (!cancelled) setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, path]);

  return (
    <div className={s.container}>
      <div className={`${s.header} chrome-mono`}>
        <span className={s.badge}>diff</span>
        <span className={s.path} title={path}>{path}</span>
        <button onClick={onClose} className={s.close} aria-label="Close diff">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className={s.body}>
        {state.kind === "loading" && <div className={s.notice}>Loading diff…</div>}
        {state.kind === "error" && <div className={s.notice}>Failed to load diff: {state.message}</div>}
        {state.kind === "tooLarge" && <div className={s.notice}>File too large to diff (&gt;1 MB)</div>}
        {state.kind === "ready" && (
          <DiffViewMode oldContent={state.oldText} newContent={state.newText} language={getLanguage(path)} />
        )}
      </div>
    </div>
  );
}
