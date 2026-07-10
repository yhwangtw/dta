"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { getFileName } from "@/lib/file-paths";
import styles from "./SearchPanel.module.css";

interface GrepMatch {
  relative: string;
  full: string;
  line: number;
  col: number;
  text: string;
}

interface Props {
  cwd: string | null;
  /** Open a file at a line (search hit). */
  onOpenFile: (filePath: string, fileName: string, line?: number) => void;
}

// Split a line around the match [col, col+len) so the hit can be highlighted.
// col is 1-based; len is the query length. Best-effort — rg/js both report the
// first match's column, which is what we highlight.
function highlight(text: string, col: number, len: number) {
  const start = Math.max(0, col - 1);
  if (len <= 0 || start >= text.length) return text;
  return (
    <>
      {text.slice(0, start)}
      <span className={styles.mark}>{text.slice(start, start + len)}</span>
      {text.slice(start + len)}
    </>
  );
}

/**
 * Full-text project search. Debounced query → GET /api/files/grep; results are
 * grouped by file, and clicking a hit opens the file at that line in the
 * right-panel viewer.
 */
export function SearchPanel({ cwd, onOpenFile }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matches, setMatches] = useState<GrepMatch[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [truncated, setTruncated] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!cwd || q.length < 2) {
      setMatches([]);
      setState("idle");
      return;
    }
    const seq = ++seqRef.current;
    setState("loading");
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ cwd, q, ...(caseSensitive ? { case: "1" } : {}) });
        const res = await fetch(`/api/files/grep?${params.toString()}`);
        const d = (await res.json()) as { matches?: GrepMatch[]; truncated?: boolean; error?: string };
        if (seqRef.current !== seq) return; // stale
        if (!res.ok || d.error) { setState("error"); setMatches([]); return; }
        setMatches(d.matches ?? []);
        setTruncated(!!d.truncated);
        setState("done");
      } catch {
        if (seqRef.current === seq) { setState("error"); setMatches([]); }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, cwd, caseSensitive]);

  // Group hits by file, preserving encounter order.
  const groups = useMemo(() => {
    const byFile = new Map<string, { relative: string; full: string; hits: GrepMatch[] }>();
    for (const m of matches) {
      let g = byFile.get(m.full);
      if (!g) { g = { relative: m.relative, full: m.full, hits: [] }; byFile.set(m.full, g); }
      g.hits.push(m);
    }
    return [...byFile.values()];
  }, [matches]);

  const qlen = query.trim().length;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>{t("search.title")}</div>
        <div className={styles.inputRow}>
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            spellCheck={false}
            autoFocus
            aria-label={t("search.title")}
          />
          <button
            className={`${styles.caseBtn} ${caseSensitive ? styles.caseBtnActive : ""}`}
            onClick={() => setCaseSensitive((v) => !v)}
            title={t("search.caseSensitive")}
            aria-pressed={caseSensitive}
          >
            Aa
          </button>
        </div>
      </div>

      {!cwd ? (
        <div className={styles.status}>{t("search.noProject")}</div>
      ) : state === "loading" ? (
        <div className={styles.status}>{t("search.searching")}</div>
      ) : state === "error" ? (
        <div className={styles.status}>{t("search.error")}</div>
      ) : state === "done" && matches.length === 0 ? (
        <div className={styles.status}>{t("search.noMatches")}</div>
      ) : (
        <>
          {state === "done" && (
            <div className={styles.status}>
              {matches.length} {matches.length === 1 ? t("search.hit") : t("search.hits")} · {groups.length} {t("search.files")}
              {truncated ? ` (${t("search.truncated")})` : ""}
            </div>
          )}
          <div className={styles.results}>
            {groups.map((g) => (
              <div key={g.full} className={styles.fileGroup}>
                <div className={styles.fileHeader} title={g.full}>
                  <span className={styles.fileName}>{getFileName(g.relative)}</span>
                  <span className={styles.fileDir}>{g.relative}</span>
                  <span className={styles.fileCount}>{g.hits.length}</span>
                </div>
                {g.hits.map((m, i) => (
                  <button
                    key={`${m.line}:${m.col}:${i}`}
                    className={styles.hit}
                    onClick={() => onOpenFile(m.full, getFileName(m.full), m.line)}
                    title={`${g.relative}:${m.line}`}
                  >
                    <span className={styles.lineNo}>{m.line}</span>
                    <span className={styles.lineText}>{highlight(m.text, m.col, qlen)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
