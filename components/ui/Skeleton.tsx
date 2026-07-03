"use client";

import styles from "./Skeleton.module.css";

interface Props {
  count?: number;
  /** Width pattern: array of CSS widths (e.g. ["55%", "67%", "79%"]) */
  widths?: (string | number)[];
  /** Extra class for the wrapper (each line also gets a unique key) */
  className?: string;
  /** Inline style for the wrapper */
  style?: React.CSSProperties;
  /** Indent each line by this many pixels (left margin) */
  indentStep?: number;
  /** Vertical spacing between lines */
  marginBottom?: number;
  /** Alternate indent on/off */
  alternateIndent?: boolean;
}

/**
 * Loading skeleton — a stack of animated placeholder lines.
 * Defaults to 6 lines with random-feeling widths to simulate content.
 */
export function Skeleton({
  count = 6,
  widths,
  className,
  style,
  indentStep = 0,
  marginBottom,
  alternateIndent = false,
}: Props) {
  return (
    <div className={className ?? styles.wrapper} style={style}>
      {Array.from({ length: count }, (_, i) => {
        const width = widths?.[i] ?? `${50 + (i % 4) * 12}%`;
        return (
          <div
            key={i}
            className={`skeleton-line ${styles.line}`}
            style={{
              width,
              marginLeft: indentStep ? i * indentStep : alternateIndent ? (i % 2 === 0 ? 0 : 60) : 0,
              marginBottom,
            }}
          />
        );
      })}
    </div>
  );
}

interface SessionItemSkeletonProps {
  count?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Two-line skeleton that mimics a real session row:
 *   - title bar (10px tall, 65% width)
 *   - meta line (8px tall, 35% width)
 *
 * Replaces the 6 stacked gray lines that used to render here — now each
 * placeholder is shaped like an actual session card so the eye gets a
 * correct preview of the layout while data is loading.
 */
export function SessionItemSkeleton({ count = 6, className, style }: SessionItemSkeletonProps) {
  return (
    <div className={className ?? styles.sessionItemWrapper} style={style}>
      {Array.from({ length: count }, (_, i) => (
        // Slight per-item indent alternation — mirrors the staggered look of a
        // real session list (some rows have tags, some don't).
        <div
          key={i}
          className={styles.sessionItem}
          style={{ marginLeft: i % 2 === 0 ? 0 : 14 }}
        >
          <div className={`skeleton-line ${styles.sessionItemTitle}`} style={{ width: "65%" }} />
          <div className={`skeleton-line ${styles.sessionItemMeta}`} style={{ width: "35%" }} />
        </div>
      ))}
    </div>
  );
}
