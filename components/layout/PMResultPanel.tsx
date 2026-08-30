"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import type { StoredPMResult } from "@/lib/agents/pm/pm-types";
import type { MeetingReviewDecision } from "@/lib/agents/meeting/meeting-types";
import { useI18n } from "@/lib/i18n";
import { WorkflowActionsPanel } from "./WorkflowActionsPanel";
import s from "./MeetingResultPanel.module.css";

interface Props { sessionId: string }
interface Payload { metadata: AgentMetadata; pmRun: StoredPMResult | null }

export function PMResultPanel({ sessionId }: Props) {
  const { locale, t } = useI18n();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewing, setReviewing] = useState<MeetingReviewDecision | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/agent-sessions/${encodeURIComponent(sessionId)}/metadata`, { cache: "no-store", signal });
      const body = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setPayload(body);
      setError(null);
      return body.pmRun?.status;
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return undefined;
      setError(cause instanceof Error ? cause.message : String(cause));
      return undefined;
    }
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const controller = new AbortController();
    const poll = async () => {
      const status = await load(controller.signal);
      if (active && status !== "completed" && status !== "failed") timer = window.setTimeout(poll, 1_500);
    };
    void poll();
    return () => { active = false; controller.abort(); if (timer) window.clearTimeout(timer); };
  }, [load]);

  const run = payload?.pmRun;
  const submitReview = async (decision: MeetingReviewDecision) => {
    if (!run || reviewing) return;
    setReviewing(decision);
    setReviewError(null);
    try {
      const response = await fetch(`/api/pm-agent/runs/${encodeURIComponent(run.runId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ...(reviewComment.trim() ? { comment: reviewComment.trim() } : {}) }),
      });
      const body = await response.json() as { pmRun?: StoredPMResult; error?: string };
      if (!response.ok || !body.pmRun) throw new Error(body.error || `HTTP ${response.status}`);
      setPayload((current) => current ? { ...current, pmRun: body.pmRun! } : current);
      setReviewComment("");
    } catch (cause) {
      setReviewError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReviewing(null);
    }
  };
  if (error) return <div className={s.state} role="status">{error}</div>;
  if (!run || run.status === "running") return <div className={s.state}><div className={s.stateCard}><strong>{t("pmResult.generating")}</strong><p>{t("pmResult.generatingHint")}</p></div></div>;
  if (run.status === "failed" || !run.result) return <div className={s.state}><div className={`${s.stateCard} ${s.failed}`}><strong>{t("pmResult.failed")}</strong><p>{run.error || t("pmResult.failedHint")}</p></div></div>;

  return <div className={s.panel} data-testid="pm-result-panel">
    <header className={s.hero}><span>DTA · PM RESULT</span><h2>{t("pmResult.title")}</h2><p>{run.result.requirementSummary}</p></header>
    <section className={s.review} data-review-status={run.reviewStatus}>
      <div className={s.reviewHeading}><div><span>{t("meetingReview.controlPlane")}</span><h3>{t(`meetingReview.status.${run.reviewStatus}`)}</h3></div><strong>{t("meetingReview.revision").replace("{revision}", String(run.revision))}</strong></div>
      <p>{t(`pmReview.hint.${run.reviewStatus}`)}</p>
      {(run.reviewStatus === "needs_review" || run.reviewStatus === "approved") && <>
        <label htmlFor={`pm-review-${run.runId}`}>{t("meetingReview.comment")}</label>
        <textarea id={`pm-review-${run.runId}`} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder={t("meetingReview.commentPlaceholder")} disabled={Boolean(reviewing)} maxLength={5_000} />
        <div className={s.reviewActions}>
          {run.reviewStatus === "needs_review" && <button type="button" className={s.approve} disabled={Boolean(reviewing)} onClick={() => void submitReview("approved")}>{reviewing === "approved" ? t("meetingReview.saving") : t("meetingReview.approve")}</button>}
          <button type="button" disabled={Boolean(reviewing) || !reviewComment.trim()} onClick={() => void submitReview("changes_requested")}>{reviewing === "changes_requested" ? t("meetingReview.saving") : t("meetingReview.requestChanges")}</button>
          <button type="button" className={s.reject} disabled={Boolean(reviewing) || !reviewComment.trim()} onClick={() => void submitReview("rejected")}>{reviewing === "rejected" ? t("meetingReview.saving") : t("meetingReview.reject")}</button>
        </div>
      </>}
      {reviewError && <div className={s.reviewError} role="alert">{reviewError}</div>}
      {run.reviewHistory.length > 0 && <details className={s.reviewHistory}><summary>{t("meetingReview.history")} · {run.reviewHistory.length}</summary><ol>{[...run.reviewHistory].reverse().map((entry, index) => <li key={`${entry.reviewedAt}-${index}`}><strong>{t(`meetingReview.status.${entry.status}`)}</strong><small>{entry.actorId} · {new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.reviewedAt))}</small>{entry.comment && <p>{entry.comment}</p>}</li>)}</ol></details>}
    </section>
    <section>
      <h3>{t("pmResult.artifacts")} <span>{run.result.artifacts.length}</span></h3>
      <div className={s.artifacts}>{run.result.artifacts.map((artifact) => <a key={artifact.artifactId} href={`/api/artifacts/${encodeURIComponent(artifact.artifactId)}`} target="_blank" rel="noreferrer"><span>{artifact.type}</span><strong>{artifact.title}</strong></a>)}</div>
    </section>
    <WorkflowActionsPanel agentId="pm-agent" sourceRunId={run.runId} sourceVersion={`${run.revision}:${run.reviewStatus}:${run.updatedAt}`} />
    <section>
      <h3>{t("pmResult.recommendedActions")} <span>{run.actions.length}</span></h3>
      {run.actions.length === 0 ? <p className={s.empty}>{t("pmResult.noActions")}</p> : <ul>{run.actions.map((action, index) => <li key={`${action.type}-${action.target ?? index}`}><strong>{action.target || action.type}</strong>{action.reason && <p>{action.reason}</p>}<small>{action.type}</small></li>)}</ul>}
    </section>
  </div>;
}
