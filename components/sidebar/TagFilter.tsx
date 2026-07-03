"use client";

import type { SessionTags } from "@/hooks/useTags";
import styles from "./TagFilter.module.css";

interface Props {
  tags: SessionTags;
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

export function TagFilter({ tags, activeTag, onSelectTag }: Props) {
  const all = Object.entries(tags)
    .map(([tag, sessions]) => ({ tag, count: sessions.length }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 20);

  if (all.length === 0) return null;

  return (
    <div className={styles.row}>
      {all.map(({ tag, count }) => (
        <button
          key={tag}
          onClick={() => onSelectTag(activeTag === tag ? null : tag)}
          className={`${styles.chip} ${activeTag === tag ? styles.chipActive : ""}`}
          title={`${count} session${count === 1 ? "" : "s"} tagged #${tag}`}
        >
          <span className={styles.hash}>#</span>{tag}
          <span className={styles.count}>{count}</span>
        </button>
      ))}
      {activeTag && (
        <button onClick={() => onSelectTag(null)} className={styles.clear} title="Clear tag filter">
          ×
        </button>
      )}
    </div>
  );
}
