"use client";

import { useEffect, useMemo, useState } from "react";
import { LibraryBig, Search, X } from "lucide-react";
import type { StoredMeetingResult } from "@/lib/agents/meeting/meeting-types";
import { useI18n } from "@/lib/i18n";
import s from "./MeetingKnowledgePanel.module.css";

interface Props {
  onOpenSession: (sessionId: string) => void | Promise<void>;
}

export function MeetingKnowledgePanel({ onOpenSession }: Props) {
  const { t } = useI18n();
  const [runs, setRuns] = useState<StoredMeetingResult[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/meeting-agent/runs?limit=200", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ runs?: StoredMeetingResult[] }> : { runs: [] })
      .then((payload) => setRuns((payload.runs ?? []).filter((run) => run.status === "completed" && run.reviewStatus === "approved" && Boolean(run.result))))
      .catch(() => setRuns([]))
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const totals = useMemo(() => runs.reduce((summary, run) => ({
    meetings: summary.meetings + 1,
    decisions: summary.decisions + (run.result?.decisions.length ?? 0),
    actions: summary.actions + (run.result?.actionItems.length ?? 0),
    requirements: summary.requirements + (run.result?.requirements.length ?? 0),
  }), { meetings: 0, decisions: 0, actions: 0, requirements: 0 }), [runs]);
  const normalized = query.trim().toLocaleLowerCase();
  const visible = runs.filter((run) => !normalized || [
    run.result?.title,
    run.result?.summary,
    ...(run.result?.decisions.map((item) => item.text) ?? []),
    ...(run.result?.actionItems.flatMap((item) => [item.title, item.description, item.owner]) ?? []),
    ...(run.result?.requirements.flatMap((item) => [item.title, item.description]) ?? []),
  ].filter(Boolean).join("\n").toLocaleLowerCase().includes(normalized));

  return (
    <section className={s.panel} aria-label={t("meetingKnowledge.title")} data-testid="meeting-knowledge">
      <header className={s.header}>
        <div className={s.headingIcon} aria-hidden>
          <LibraryBig />
        </div>
        <div><strong>{t("meetingKnowledge.title")}</strong><span>{t("meetingKnowledge.subtitle")}</span></div>
      </header>
      <div className={s.search}>
        <Search aria-hidden />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("meetingKnowledge.search")} aria-label={t("meetingKnowledge.search")} />
        {query && <button type="button" onClick={() => setQuery("")} aria-label={t("search.clear")}><X aria-hidden /></button>}
      </div>
      <div className={s.metrics} aria-label={t("meetingKnowledge.coverage")}>
        <div><strong>{totals.meetings}</strong><span>{t("meetingKnowledge.meetings")}</span></div>
        <div><strong>{totals.decisions}</strong><span>{t("meetingResult.decisions")}</span></div>
        <div><strong>{totals.actions}</strong><span>{t("meetingResult.actions")}</span></div>
        <div><strong>{totals.requirements}</strong><span>{t("meetingResult.requirements")}</span></div>
      </div>
      <div className={s.results} aria-busy={loading}>
        {loading ? <div className={s.empty}>{t("common.loading")}</div> : visible.length === 0 ? (
          <div className={s.empty}><span aria-hidden>⌕</span><strong>{normalized ? t("meetingKnowledge.noResults") : t("meetingKnowledge.empty")}</strong><p>{normalized ? t("meetingKnowledge.tryAnother") : t("meetingKnowledge.emptyHint")}</p></div>
        ) : visible.map((run) => (
          <button key={run.runId} type="button" className={s.result} disabled={!run.sessionId} onClick={() => run.sessionId && void onOpenSession(run.sessionId)}>
            <span>{t("meetingKnowledge.approvedRecord")}</span>
            <strong>{run.result?.title || t("meetingLibrary.untitled")}</strong>
            <p>{run.result?.summary}</p>
            <small>{run.result?.decisions.length ?? 0} {t("meetingResult.decisions")} · {run.result?.actionItems.length ?? 0} {t("meetingResult.actions")} · {run.result?.requirements.length ?? 0} {t("meetingResult.requirements")}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
