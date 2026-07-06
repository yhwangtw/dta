"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { encodeFilePathForApi, getRelativeFilePath } from "@/lib/file-paths";
import { useFileWatch } from "@/hooks/useFileWatch";
import { formatSize, type FileData } from "./file-viewer-utils";
import { SourceView } from "./text-viewer/SourceView";
import { PlainSourceView } from "./text-viewer/PlainSourceView";
import { DiffViewMode } from "./text-viewer/DiffViewMode";
import { PreviewView } from "./text-viewer/PreviewView";
import { showToast } from "@/hooks/useToast";
import styles from "./TextFileViewer.module.css";

interface Props {
  filePath: string;
  cwd?: string;
}

export function TextFileViewer({ filePath, cwd }: Props) {
  const [data, setData] = useState<FileData | null>(null);
  const [prevContent, setPrevContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [viewMode, setViewMode] = useState<"source" | "diff">("source");
  const [wrapLines, setWrapLines] = useState(false);
  const [changeCount, setChangeCount] = useState(0);
  const { watching, refreshTrigger } = useFileWatch(filePath);

  // ── In-file find / go-to-line ────────────────────────────────────────────
  const [findQuery, setFindQuery] = useState("");
  const [findPos, setFindPos] = useState(0);
  // Debounced: activeLine flips per-line rendering in the highlighter — don't
  // re-render a big file on every keystroke.
  const [debouncedFind, setDebouncedFind] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFind(findQuery), 150);
    return () => clearTimeout(t);
  }, [findQuery]);

  // Large files skip syntax highlighting by default (Prism on thousands of
  // lines janks for seconds); a toolbar button forces it when wanted.
  const [forceHighlight, setForceHighlight] = useState(false);

  // ── Edit mode ────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const fetchContent = useCallback((filePath: string, isRefresh = false) => {
    const encoded = encodeFilePathForApi(filePath);
    return fetch(`/api/files/${encoded}?type=read`)
      .then((r) => r.json())
      .then((d: FileData & { error?: string }) => {
        if (d.error) {
          setError(d.error);
          return null;
        }
        if (isRefresh) {
          setData((prev) => {
            if (prev) setPrevContent(prev.content);
            return d;
          });
          setChangeCount((c) => c + 1);
        } else {
          setData(d);
        }
        return d;
      })
      .catch((e) => {
        setError(String(e));
        return null;
      });
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    setPrevContent(null);
    setPreviewMode(false);
    setViewMode("source");
    setWrapLines(false);
    setChangeCount(0);

    fetchContent(filePath).then((d) => {
      if (d?.language === "markdown") setPreviewMode(true);
    }).finally(() => setLoading(false));
  }, [filePath, fetchContent]);

  // Refresh on file-watch change events — debounced 300ms so an agent
  // writing in bursts triggers one reload, and never clobber an open editor.
  useEffect(() => {
    if (refreshTrigger === 0) return;
    const t = setTimeout(() => {
      if (!editingRef.current) fetchContent(filePath, true);
    }, 300);
    return () => clearTimeout(t);
  }, [refreshTrigger, filePath, fetchContent]);

  // Reset transient tool state when switching files
  useEffect(() => {
    setFindQuery("");
    setFindPos(0);
    setEditing(false);
    setDraft("");
    setForceHighlight(false);
  }, [filePath]);

  // Line numbers (1-based) matching the (debounced) find query; ":123" jumps.
  const matches = useMemo(() => {
    if (!data) return [] as number[];
    const q = debouncedFind.trim().toLowerCase();
    if (!q || q.startsWith(":")) return [];
    const out: number[] = [];
    data.content.split("\n").forEach((line, i) => {
      if (line.toLowerCase().includes(q)) out.push(i + 1);
    });
    return out;
  }, [data, debouncedFind]);

  const lineCount = useMemo(() => (data ? data.content.split("\n").length : 0), [data]);
  const isLarge = !!data && (data.size > 150_000 || lineCount > 1500);
  const usePlain = isLarge && !forceHighlight;

  const gotoLine = debouncedFind.trim().startsWith(":") ? parseInt(debouncedFind.trim().slice(1), 10) : NaN;
  const activeLine = Number.isFinite(gotoLine) && gotoLine > 0
    ? gotoLine
    : matches.length > 0
      ? matches[Math.min(findPos, matches.length - 1)]
      : null;

  const copyContent = useCallback(() => {
    if (!data) return;
    navigator.clipboard?.writeText(data.content)
      .then(() => showToast("Copied file contents"))
      .catch(() => {});
  }, [data]);

  const startEditing = useCallback(() => {
    if (!data) return;
    setDraft(data.content);
    setEditing(true);
    setFindQuery("");
  }, [data]);

  const saveEdit = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const encoded = encodeFilePathForApi(filePath);
      const res = await fetch(`/api/files/${encoded}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      const result = await res.json().catch(() => ({})) as { error?: string; size?: number };
      if (!res.ok || result.error) {
        showToast(`Save failed: ${result.error ?? `HTTP ${res.status}`}`, { type: "error" });
        return;
      }
      setData((prev) => (prev ? { ...prev, content: draft, size: result.size ?? prev.size } : prev));
      setEditing(false);
      showToast("Saved");
    } catch (e) {
      showToast(`Save failed: ${e instanceof Error ? e.message : e}`, { type: "error" });
    } finally {
      setSaving(false);
    }
  }, [draft, filePath, saving]);

  if (loading) {
    return <div className={styles.loadingState}>Loading...</div>;
  }

  if (error) {
    return <div className={styles.errorState}>{error}</div>;
  }

  if (!data) return null;

  const isHtml = data.language === "html";
  const isMarkdown = data.language === "markdown";
  const lines = data.content.split("\n");
  const hasDiff = prevContent !== null && prevContent !== data.content;

  return (
    <div className={styles.root}>
      {/* Status bar */}
      <div className={styles.statusBar}>
        <span className={styles.filePath} title={filePath}>
          {getRelativeFilePath(filePath, cwd)}
        </span>
        <span className={styles.language}>{data.language}</span>
        {viewMode === "source" && <span>{lines.length} lines</span>}
        <span>{formatSize(data.size)}</span>

        {/* Live watch indicator */}
        <span
          title={watching ? "Live sync active" : "Not watching"}
          className={watching ? styles.watchIndicatorActive : styles.watchIndicatorInactive}
        >
          <span className={watching ? styles.watchDotActive : styles.watchDotInactive} />
          {watching ? "live" : "static"}
        </span>

        {/* Diff / Source toggle */}
        {hasDiff && (
          <div className={styles.toggleGroup}>
            <button
              onClick={() => setViewMode("source")}
              className={`${styles.toggleGroupFirst} ${viewMode === "source" ? styles.toggleActive : styles.toggleInactive}`}
            >
              Source
            </button>
            <button
              onClick={() => setViewMode("diff")}
              className={`${styles.toggleGroupSecond} ${viewMode === "diff" ? styles.toggleActive : styles.toggleInactive}`}
            >
              Diff {changeCount > 0 && <span className={styles.changeCount}>+{changeCount}</span>}
            </button>
          </div>
        )}

        {/* Word wrap toggle */}
        {viewMode === "source" && !previewMode && !editing && (
          <button
            onClick={() => setWrapLines((v) => !v)}
            title={wrapLines ? "Disable word wrap" : "Enable word wrap"}
            className={`${styles.toggleStandalone} ${wrapLines ? styles.toggleActive : styles.toggleInactive}`}
          >
            wrap
          </button>
        )}

        {/* Large-file highlight toggle (plain is the default for big files) */}
        {viewMode === "source" && !previewMode && !editing && isLarge && (
          <button
            onClick={() => setForceHighlight((v) => !v)}
            title={usePlain
              ? "Large file — rendered without highlighting. Click to force syntax highlighting (slow)."
              : "Switch back to fast plain rendering"}
            className={`${styles.toggleStandalone} ${forceHighlight ? styles.toggleActive : styles.toggleInactive}`}
          >
            {usePlain ? "plain·large" : "highlighted"}
          </button>
        )}

        {/* Copy contents */}
        {!editing && (
          <button onClick={copyContent} title="Copy file contents" className={`${styles.toggleStandalone} ${styles.toggleInactive}`}>
            copy
          </button>
        )}

        {/* Edit / Save / Cancel */}
        {viewMode === "source" && !previewMode && (
          editing ? (
            <div className={styles.toggleGroup}>
              <button
                onClick={() => void saveEdit()}
                disabled={saving}
                className={`${styles.toggleGroupFirst} ${styles.toggleActive}`}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(""); }}
                disabled={saving}
                className={`${styles.toggleGroupSecond} ${styles.toggleInactive}`}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={startEditing} title="Edit this file in place" className={`${styles.toggleStandalone} ${styles.toggleInactive}`}>
              edit
            </button>
          )
        )}

        {/* In-file find / go-to-line */}
        {viewMode === "source" && !previewMode && !editing && (
          <span className={styles.findWrap}>
            <input
              value={findQuery}
              onChange={(e) => { setFindQuery(e.target.value); setFindPos(0); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches.length > 0) {
                  e.preventDefault();
                  setFindPos((p) => e.shiftKey
                    ? (p - 1 + matches.length) % matches.length
                    : (p + 1) % matches.length);
                } else if (e.key === "Escape") {
                  setFindQuery("");
                }
              }}
              placeholder="find / :line"
              className={styles.findInput}
              spellCheck={false}
            />
            {findQuery.trim() && !findQuery.trim().startsWith(":") && (
              <span className={styles.findCount}>
                {matches.length > 0 ? `${Math.min(findPos, matches.length - 1) + 1}/${matches.length}` : "0/0"}
              </span>
            )}
          </span>
        )}

        {/* HTML Code/Preview toggle */}
        {isHtml && viewMode === "source" && (
          <div className={styles.toggleGroup}>
            <button
              onClick={() => setPreviewMode(false)}
              className={`${styles.toggleGroupFirst} ${!previewMode ? styles.toggleActive : styles.toggleInactive}`}
            >
              Code
            </button>
            <button
              onClick={() => setPreviewMode(true)}
              className={`${styles.toggleGroupSecond} ${previewMode ? styles.toggleActive : styles.toggleInactive}`}
            >
              Preview
            </button>
          </div>
        )}

        {/* Markdown Preview/Raw toggle */}
        {isMarkdown && viewMode === "source" && (
          <div className={styles.toggleGroup}>
            <button
              onClick={() => setPreviewMode(true)}
              className={`${styles.toggleGroupFirst} ${previewMode ? styles.toggleActive : styles.toggleInactive}`}
            >
              Preview
            </button>
            <button
              onClick={() => setPreviewMode(false)}
              className={`${styles.toggleGroupSecond} ${!previewMode ? styles.toggleActive : styles.toggleInactive}`}
            >
              Raw
            </button>
          </div>
        )}
      </div>

      {/* Content area — dispatch to mode-specific component */}
      <div className={styles.contentArea}>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                void saveEdit();
              }
            }}
            className={styles.editor}
            spellCheck={false}
            aria-label="File editor"
          />
        ) : viewMode === "diff" && hasDiff ? (
          <DiffViewMode
            oldContent={prevContent!}
            newContent={data.content}
            language={data.language}
          />
        ) : (isHtml || isMarkdown) && previewMode ? (
          <PreviewView content={data.content} language={data.language} />
        ) : usePlain ? (
          <PlainSourceView content={data.content} activeLine={activeLine} />
        ) : (
          <SourceView content={data.content} language={data.language} wrapLines={wrapLines} activeLine={activeLine} />
        )}
      </div>
    </div>
  );
}
