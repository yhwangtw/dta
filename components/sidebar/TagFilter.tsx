"use client";

import type { SessionTags } from "@/hooks/useTags";
import { getTagStyle } from "@/lib/tag-colors";
import { useTheme } from "@/hooks/useTheme";
import styles from "./TagFilter.module.css";

interface Props {
  tags: SessionTags;
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

export function TagFilter({ tags, activeTag, onSelectTag }: Props) {
  const { theme } = useTheme();
  const all = Object.entries(tags)
    .map(([tag, sessions]) => ({ tag, count: sessions.length }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 20);

  if (all.length === 0) return null;

  return (
    <div className={styles.row}>
      {all.map(({ tag, count }) => {
        const ts = getTagStyle(tag, theme);
        const isActive = activeTag === tag;
        // Active state keeps the same hue but uses a stronger fill so it reads
        // as "selected" against the row background.
        const bg = isActive ? ts.fg : ts.bg;
        const fg = isActive ? "#ffffff" : ts.fg;
        const border = isActive ? ts.fg : ts.border;
        return (
          <button
            key={tag}
            onClick={() => onSelectTag(activeTag === tag ? null : tag)}
            className={styles.chip}
            title={`${count} session${count === 1 ? "" : "s"} tagged #${tag}`}
            style={{ background: bg, color: fg, borderColor: border }}
          >
            <span className={styles.hash}>#</span>{tag}
            <span
              className={styles.count}
              style={isActive ? { background: "rgba(255,255,255,0.25)", color: "#fff" } : undefined}
            >
              {count}
            </span>
          </button>
        );
      })}
      {activeTag && (
        <button onClick={() => onSelectTag(null)} className={styles.clear} title="Clear tag filter">
          ×
        </button>
      )}
    </div>
  );
}
