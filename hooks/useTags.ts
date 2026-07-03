"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export type SessionTags = Record<string, string[]>;

/**
 * Manages the user's session-tag map. The map is keyed by tag name (not session
 * id) for cheap "filter by tag" lookups; reverse lookup goes through `sessionTagsOf()`.
 */
export function useTags() {
  const [tags, setTags] = useState<SessionTags>({});
  const [loading, setLoading] = useState(true);
  const ref = useRef(tags);
  ref.current = tags;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions/tags");
      if (!res.ok) return;
      const data = await res.json() as { tags?: SessionTags };
      setTags(data.tags ?? {});
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setTag = useCallback(async (sessionId: string, tag: string) => {
    const norm = tag.toLowerCase().trim().replace(/^#/, "").slice(0, 32);
    if (!norm) return;
    // optimistic: invert the tag->sessions map locally
    setTags((prev) => {
      const next: SessionTags = { ...prev };
      if (!next[norm]) next[norm] = [];
      if (!next[norm].includes(sessionId)) {
        next[norm] = [...next[norm], sessionId];
      }
      return next;
    });
    try {
      const res = await fetch("/api/sessions/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, tag: norm }),
      });
      if (!res.ok) await load(); // rollback via reload
    } catch {
      await load();
    }
  }, [load]);

  const removeTag = useCallback(async (sessionId: string, tag: string) => {
    const norm = tag.toLowerCase();
    setTags((prev) => {
      const next: SessionTags = { ...prev };
      if (next[norm]) {
        next[norm] = next[norm].filter((id) => id !== sessionId);
        if (next[norm].length === 0) delete next[norm];
      }
      return next;
    });
    try {
      const res = await fetch("/api/sessions/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, tag: norm }),
      });
      if (!res.ok) await load();
    } catch {
      await load();
    }
  }, [load]);

  const sessionTagsOf = useCallback((sessionId: string): string[] => {
    const result: string[] = [];
    for (const [tag, sessions] of Object.entries(ref.current)) {
      if (sessions.includes(sessionId)) result.push(tag);
    }
    return result;
  }, []);

  return { tags, loading, load, setTag, removeTag, sessionTagsOf };
}
