"use client";

import styles from "./PiAgentTitle.module.css";

/**
 * App wordmark: π in a gradient badge + a two-line lockup.
 * Colors come from the active skin's accent tokens, so the mark re-themes
 * with every appearance.
 */
export function PiAgentTitle() {
  return (
    <span className={styles.lockup}>
      <span className={styles.badge} aria-hidden>
        π
      </span>
      <span className={styles.textCol}>
        <span className={styles.name}>with tGD</span>
        <span className={styles.tagline}>coding agent</span>
      </span>
    </span>
  );
}
