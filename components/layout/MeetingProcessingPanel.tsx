"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import type { StoredMeetingResult } from "@/lib/agents/meeting/meeting-types";
import { useI18n } from "@/lib/i18n";
import s from "./MeetingProcessingPanel.module.css";

type Filter = "all" | "active" | "ready" | "issues";

interface Props {
  onOpenSession: (sessionId: string) => void | Promise<void>;
  onNewMeeting: () => void;
}

export function MeetingProcessingPanel({ onOpenSession, onNewMeeting }: Props) {
  const { locale, t } = useI18n();
  const [runs, setRuns] = useState<StoredMeetingResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/meeting-agent/runs?limit=100", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { runs?: StoredMeetingResult[] };
      setRuns(payload.runs ?? []);
    } catch {
      if (!quiet) setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 2_500);
    return () => window.clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => ({
    active: runs.filter((run) => run.status === "running").length,
    ready: runs.filter((run) => run.status === "completed").length,
    issues: runs.filter((run) => run.status === "failed").length,
  }), [runs]);
  const visibleRuns = runs.filter((run) => filter === "all"
    || (filter === "active" && run.status === "running")
    || (filter === "ready" && run.status === "completed")
    || (filter === "issues" && run.status === "failed"));
  const formatter = new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <section className={s.panel} aria-label={t("meetingProcessing.title")} data-testid="meeting-processing">
      <header className={s.header}>
        <div className={s.headingIcon} aria-hidden>
          <Activity />
        </div>
        <div><strong>{t("meetingProcessing.title")}</strong><span>{t("meetingProcessing.subtitle")}</span></div>
        <button type="button" onClick={() => void load()} aria-label={t("attention.refresh")} title={t("attention.refresh")}>
          <RefreshCw aria-hidden />
        </button>
      </header>

      <div className={s.summary}>
        <button type="button" aria-pressed={filter === "active"} onClick={() => setFilter(filter === "active" ? "all" : "active")}><strong>{counts.active}</strong><span>{t("meetingProcessing.active")}</span></button>
        <button type="button" aria-pressed={filter === "ready"} onClick={() => setFilter(filter === "ready" ? "all" : "ready")}><strong>{counts.ready}</strong><span>{t("meetingProcessing.ready")}</span></button>
        <button type="button" aria-pressed={filter === "issues"} onClick={() => setFilter(filter === "issues" ? "all" : "issues")}><strong>{counts.issues}</strong><span>{t("meetingProcessing.issues")}</span></button>
      </div>

      <div className={s.list} aria-busy={loading}>
        {loading ? <div className={s.empty}>{t("common.loading")}</div> : visibleRuns.length === 0 ? (
          <div className={s.empty}>
            <span aria-hidden>✓</span>
            <strong>{filter === "all" ? t("meetingProcessing.empty") : t("meetingProcessing.noMatches")}</strong>
            <p>{t("meetingProcessing.emptyHint")}</p>
            {filter === "all" && <button type="button" onClick={onNewMeeting}>{t("meetingLibrary.new")}</button>}
          </div>
        ) : visibleRuns.map((run) => {
          const title = run.result?.title || t("meetingLibrary.untitled");
          const stateLabel = run.status === "running" ? t("meetingProcessing.collecting") : run.status === "completed" ? t("meetingProcessing.minutesReady") : t("meetingProcessing.needsContext");
          return (
            <article key={run.runId} className={s.item} data-status={run.status}>
              <div className={s.stateIcon} aria-hidden>{run.status === "running" ? "…" : run.status === "completed" ? "✓" : "!"}</div>
              <div className={s.itemBody}>
                <div className={s.itemTop}><span data-status={run.status}>{stateLabel}</span><time dateTime={run.updatedAt}>{formatter.format(new Date(run.updatedAt))}</time></div>
                <strong>{title}</strong>
                <p>{run.status === "completed" ? run.result?.summary : run.status === "failed" ? t("meetingResult.incompleteHint") : t("meetingProcessing.collectingHint")}</p>
                {run.sessionId && <button type="button" onClick={() => void onOpenSession(run.sessionId!)}>{run.status === "completed" ? t("meetingProcessing.viewResult") : t("meetingProcessing.openConversation")} <span aria-hidden>→</span></button>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
