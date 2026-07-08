"use client";

import type { ReactNode } from "react";
import styles from "./TgdPipeline.module.css";

export type PhaseStatus = "done" | "current" | "todo";

export interface TgdPhase {
  cmd: string;
  label: string;
  desc: string;
  icon: ReactNode;
}

interface Props {
  phases: TgdPhase[];
  statusOf: (cmd: string) => PhaseStatus;
  onRun: (cmd: string) => void;
  /** Hide the whole bar (persisted by the parent). */
  onHide?: () => void;
}

/**
 * Always-visible tGD workflow pipeline. Each phase reflects whether it has been
 * run in this session (done), is the most recent one (current), or is still
 * ahead (todo). Clicking a phase drops its command into the composer.
 */
export function TgdPipeline({ phases, statusOf, onRun, onHide }: Props) {
  return (
    <div className={styles.bar}>
      <span className={styles.brand}>tGD</span>
      <div className={styles.track}>
        {phases.map((phase, i) => {
          const status = statusOf(phase.cmd);
          return (
            <div key={phase.cmd} className={styles.step}>
              {i > 0 && <span className={`${styles.connector} ${styles[`conn_${status}`]}`} />}
              <button
                onClick={() => onRun(phase.cmd)}
                className={`${styles.phase} ${styles[status]}`}
                title={`${phase.cmd} — ${phase.desc}`}
                aria-current={status === "current" ? "step" : undefined}
              >
                <span className={styles.icon} aria-hidden>
                  {status === "done" ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : phase.icon}
                </span>
                <span className={styles.label}>{phase.label}</span>
              </button>
            </div>
          );
        })}
      </div>
      {onHide && (
        <button onClick={onHide} className={styles.hide} title="Hide the tGD pipeline" aria-label="Hide tGD pipeline">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      )}
    </div>
  );
}
