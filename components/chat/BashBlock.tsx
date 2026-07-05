"use client";

import { memo, useEffect, useRef } from "react";
import styles from "./BashBlock.module.css";

interface Props {
  command: string;
  output: string;
  /** true while the command streams — shows spinner + abort */
  running?: boolean;
  exitCode?: number | null;
  cancelled?: boolean;
  truncated?: boolean;
  onAbort?: () => void;
}

/**
 * Terminal pane for direct bash execution (the `!` input prefix).
 * Renders both the live streaming run and the persisted bashExecution
 * message from the session file.
 */
export const BashBlock = memo(function BashBlock({ command, output, running, exitCode, cancelled, truncated, onAbort }: Props) {
  const outputRef = useRef<HTMLPreElement | null>(null);

  // Follow the output while streaming
  useEffect(() => {
    if (running && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, running]);

  const status = running
    ? null
    : cancelled
      ? { label: "cancelled", tone: styles.badgeWarn }
      : exitCode === 0 || exitCode === undefined || exitCode === null
        ? { label: "exit 0", tone: styles.badgeOk }
        : { label: `exit ${exitCode}`, tone: styles.badgeErr };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.prompt} aria-hidden>$</span>
        <span className={styles.command} title={command}>{command}</span>
        {running ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={styles.spinner} aria-label="Running">
              <path d="M21 12a9 9 0 1 1-6.2-8.56" />
            </svg>
            {onAbort && (
              <button onClick={onAbort} className={styles.abortButton}>
                Cancel
              </button>
            )}
          </>
        ) : (
          status && <span className={`${styles.badge} ${status.tone}`}>{status.label}</span>
        )}
        {truncated && !running && <span className={styles.truncated}>truncated</span>}
      </div>
      {(output || running) && (
        <pre ref={outputRef} className={styles.output}>{output || "…"}</pre>
      )}
    </div>
  );
});
