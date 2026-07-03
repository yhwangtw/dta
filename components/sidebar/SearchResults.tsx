"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { SessionInfo } from "@/lib/types";
import styles from "./SearchResults.module.css";

interface Match {
  entryId: string;
  role: string;
  text: string;
  line: number;
}

interface SearchHit {
  id: string;
  cwd: string;
  name?: string;
  firstMessage: string;
  created: string;
  modified: string;
  messageCount: number;
  matchedIn: "name" | "firstMessage" | "messages";
  matches: Match[];
  totalMatches: number;
}

interface Props {
  query: string;
  onSelectSession: (s: SessionInfo) => void;
  onClose: () => void;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className={styles.mark}>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function basename(p: string): string {
  return p.split("/").filter(Boolean).pop() ?? p;
}

export function SearchResults({ query, onSelectSession, onClose }: Props) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    if (query.trim().length < 1) {
      setHits([]);
      setError(null);
      setTruncated(false);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    fetch(`/api/sessions/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ hits: SearchHit[]; truncated: boolean; error?: string }>)
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setHits(data.hits);
          setTruncated(data.truncated);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e));
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [query]);

  const handleSelect = useCallback((hit: SearchHit) => {
    const session: SessionInfo = {
      id: hit.id,
      cwd: hit.cwd,
      name: hit.name,
      created: hit.created,
      modified: hit.modified,
      messageCount: hit.messageCount,
      firstMessage: hit.firstMessage,
      path: "",
    };
    onSelectSession(session);
    onClose();
  }, [onSelectSession, onClose]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLabel}>
          Search results for <span className={styles.query}>&ldquo;{query}&rdquo;</span>
        </div>
        <button onClick={onClose} className={styles.closeButton} title="Back to sessions">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {loading && <div className={styles.loading}>Searching…</div>}
      {error && <div className={styles.error}>{error}</div>}
      {!loading && !error && hits.length === 0 && (
        <div className={styles.empty}>No sessions match.</div>
      )}
      {!loading && !error && hits.length > 0 && (
        <>
          {truncated && <div className={styles.truncated}>Showing most recent matches only</div>}
          {hits.map((hit) => (
            <div
              key={hit.id}
              className={styles.hit}
              onClick={() => handleSelect(hit)}
            >
              <div className={styles.hitHeader}>
                <span className={styles.hitName}>
                  {hit.name ? highlight(hit.name, query) : <span className={styles.untitled}>(unnamed)</span>}
                </span>
                <span className={styles.hitMeta}>
                  {basename(hit.cwd)} · {hit.messageCount} msg · {relTime(hit.modified)}
                </span>
              </div>
              {hit.matchedIn === "name" ? (
                <div className={styles.matchedIn}>matched in session name</div>
              ) : hit.matchedIn === "firstMessage" && hit.matches.length === 0 ? (
                <div className={styles.snippet}>
                  {highlight(hit.firstMessage.slice(0, 200), query)}
                </div>
              ) : hit.matches.length > 0 ? (
                hit.matches.slice(0, 3).map((m, i) => (
                  <div key={i} className={styles.snippet}>
                    <span className={styles.role}>{m.role === "user" ? "👤" : "🤖"}</span>{" "}
                    {highlight(m.text, query)}
                  </div>
                ))
              ) : (
                <div className={styles.snippet}>{hit.firstMessage.slice(0, 120)}…</div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
