"use client";

import { useCallback, useEffect, useState } from "react";
import type { StoredMeetingResult } from "@/lib/agents/meeting/meeting-types";
import { useI18n } from "@/lib/i18n";
import s from "./MeetingLibraryPanel.module.css";

interface Props {
  onNewMeeting: () => void;
  onOpenSession: (sessionId: string) => void | Promise<void>;
}

export function MeetingLibraryPanel({ onNewMeeting, onOpenSession }: Props) {
  const { locale, t } = useI18n();
  const [runs, setRuns] = useState<StoredMeetingResult[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/meeting-agent/runs?limit=100", { cache: "no-store", signal });
      if (!response.ok) return;
      const payload = await response.json() as { runs?: StoredMeetingResult[] };
      setRuns(payload.runs ?? []);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setRuns([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const formatter = new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className={s.panel} aria-label={t("meetingLibrary.title")} data-testid="meeting-library">
      <header>
        <div><span>DTA</span><strong>{t("meetingLibrary.title")}</strong></div>
        <button type="button" onClick={onNewMeeting}>＋ {t("meetingLibrary.new")}</button>
      </header>
      <div className={s.subhead}>{t("meetingLibrary.subtitle")}</div>
      {loading ? <div className={s.empty}>{t("meetingLibrary.loading")}</div> : runs.length === 0 ? (
        <div className={s.empty}>
          <span aria-hidden>◌</span>
          <strong>{t("meetingLibrary.empty")}</strong>
          <p>{t("meetingLibrary.emptyHint")}</p>
          <button type="button" onClick={onNewMeeting}>{t("meetingLibrary.createFirst")}</button>
        </div>
      ) : (
        <div className={s.list}>{runs.map((run) => {
          const title = run.result?.title || t("meetingLibrary.untitled");
          const summary = run.result?.summary || (run.status === "failed"
            ? run.error?.toLowerCase().includes("without publishing a structured result")
              ? t("meetingResult.incompleteHint")
              : run.error
            : t("meetingLibrary.processing"));
          return (
            <button key={run.runId} type="button" className={s.item} disabled={!run.sessionId} onClick={() => run.sessionId && void onOpenSession(run.sessionId)}>
              <span className={s.status} data-status={run.status}>{run.status === "completed" ? t("meetingLibrary.ready") : run.status === "failed" ? t("meetingLibrary.failed") : t("meetingLibrary.processing")}</span>
              <strong>{title}</strong>
              <p>{summary}</p>
              <time dateTime={run.updatedAt}>{formatter.format(new Date(run.updatedAt))}</time>
            </button>
          );
        })}</div>
      )}
    </section>
  );
}
