"use client";

import type { AgentMessage } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { MarkdownBody } from "./MarkdownBody";
import styles from "./CompactionSummary.module.css";

const COMPACTION_PREFIX = "*The conversation history before this point was compacted into the following summary:*";

export function getCompactionSummary(message: AgentMessage): string | null {
  if (message.role !== "user") return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string" || !content.startsWith(COMPACTION_PREFIX)) return null;
  return content.slice(COMPACTION_PREFIX.length).trim();
}

export function CompactionSummary({ summary }: { summary: string }) {
  const { t } = useI18n();
  return (
    <details className={styles.card}>
      <summary className={styles.header}>
        <span className={styles.icon} aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16M7 12h10M9 19h6" />
          </svg>
        </span>
        <span className={styles.title}>{t("chat.compactionSummary")}</span>
        <span className={styles.hint}>{t("chat.compactionSummaryHint")}</span>
        <svg className={styles.chevron} width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </summary>
      <div className={styles.body}><MarkdownBody>{summary}</MarkdownBody></div>
    </details>
  );
}
