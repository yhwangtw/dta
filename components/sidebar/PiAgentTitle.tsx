"use client";

import styles from "./PiAgentTitle.module.css";

/** DTA compact wordmark. Pi remains the runtime, not the product identity. */
export function PiAgentTitle() {
  return (
    <span className={styles.lockup} title="Digital Transformation Agent">
      <span className={styles.textCol}>
        <span className={styles.name}>DTA</span>
        <span className={styles.tagline}>agent platform</span>
      </span>
    </span>
  );
}
