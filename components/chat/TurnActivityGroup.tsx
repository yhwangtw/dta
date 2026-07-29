"use client";

import { useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import styles from "./TurnActivityGroup.module.css";

interface Props {
  steps: number;
  tools: number;
  filesChanged: number;
  failed: number;
  elapsed?: number;
  children: ReactNode;
}

export function TurnActivityGroup({ steps, tools, filesChanged, failed, elapsed, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();

  return (
    <section className={`${styles.root} ${failed ? styles.rootError : ""}`} aria-label={t("chat.workLog")}>
      <button
        type="button"
        className={styles.summary}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className={styles.stateIcon} aria-hidden>
          {failed ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          )}
        </span>
        <span className={styles.title}>{t("chat.workLog")}</span>
        <span className={styles.meta}>
          <span>{steps} {t("chat.steps")}</span>
          {failed > 0 && <span className={styles.failed}>{failed} {t("chat.failed")}</span>}
          {tools > 0 && <span>{tools} {t("chat.tools")}</span>}
          {filesChanged > 0 && <span>{filesChanged} {t("chat.filesChanged")}</span>}
          {elapsed !== undefined && elapsed > 0 && <span>{elapsed}s</span>}
        </span>
        <svg className={styles.chevron} width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>
      {expanded && <div className={styles.body}>{children}</div>}
    </section>
  );
}
