"use client";

import { useState, type ReactNode } from "react";
import type { ToolCallContent, ToolResultMessage } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import styles from "./ToolRunGroup.module.css";

export interface ToolRunItem {
  block: ToolCallContent;
  result?: ToolResultMessage;
  duration?: number;
}

interface Props {
  items: ToolRunItem[];
  activeToolCallId?: string;
  children: ReactNode;
}

export function ToolRunGroup({ items, activeToolCallId, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  const active = items.find((item) => item.block.toolCallId === activeToolCallId);
  const failedCount = items.filter((item) => item.result?.isError).length;
  // Result timestamps are measured from the same assistant-message boundary,
  // so max is the elapsed run time; summing would over-count parallel calls.
  const elapsed = Math.max(0, ...items.map((item) => item.duration ?? 0));

  return (
    <section className={`${styles.group} ${active ? styles.groupRunning : ""} ${failedCount ? styles.groupError : ""}`}>
      <button
        type="button"
        className={styles.summary}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className={styles.stateIcon} aria-hidden>
          {active ? (
            <svg className={styles.spinner} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.2-8.56" />
            </svg>
          ) : failedCount ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          )}
        </span>
        <span className={styles.label} aria-live={active ? "polite" : undefined}>
          {active ? (
            <>{t("chat.runningTool")} <strong>{active.block.toolName}</strong></>
          ) : (
            <>{t("chat.ranTools")} <strong>{items.length}</strong> {t("chat.tools")}</>
          )}
        </span>
        <span className={styles.meta}>
          {failedCount > 0 && <span className={styles.failed}>{failedCount} {t("chat.failed")}</span>}
          {elapsed > 0 && <span>{elapsed}s</span>}
        </span>
        <svg className={styles.chevron} width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>
      {expanded && <div className={styles.children}>{children}</div>}
    </section>
  );
}
