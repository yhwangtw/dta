"use client";

import styles from "./FileMentionMenu.module.css";

export interface FileMentionItem {
  name: string;
  /** Path relative to the project cwd — what gets inserted after `@`. */
  relative: string;
  isDir: boolean;
}

interface Props {
  show: boolean;
  items: FileMentionItem[];
  selectedIndex: number;
  /** Selecting a file inserts it; selecting a dir drills into it. */
  onSelect: (item: FileMentionItem) => void;
  onHover: (index: number) => void;
}

function EntryIcon({ isDir }: { isDir: boolean }) {
  return isDir ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

/**
 * `@file` mention dropdown — anchored above the composer like the slash menu.
 * Items come from the file-search API (fuzzy) or a directory listing
 * (drill-down when the query ends with `/`).
 */
export function FileMentionMenu({ show, items, selectedIndex, onSelect, onHover }: Props) {
  if (!show || items.length === 0) return null;
  return (
    <div className={styles.menu} data-testid="file-mention-menu">
      {items.map((item, i) => (
        <button
          key={item.relative}
          // mousedown (not click) so the textarea keeps focus/caret
          onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
          onMouseEnter={() => onHover(i)}
          className={`${styles.item} ${i === selectedIndex ? "bg-selected " + styles.itemSelected : "bg-none hover-bg-text text-muted"}`}
        >
          <span className={styles.icon}>
            <EntryIcon isDir={item.isDir} />
          </span>
          <span className={styles.path}>
            {item.relative}
            {item.isDir ? "/" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
