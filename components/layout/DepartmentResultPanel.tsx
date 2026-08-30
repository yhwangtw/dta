"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import type { StoredDepartmentResult } from "@/lib/agents/department/department-result-store";
import type { MeetingReviewDecision } from "@/lib/agents/meeting/meeting-types";
import { useI18n } from "@/lib/i18n";
import { WorkflowActionsPanel } from "./WorkflowActionsPanel";
import s from "./MeetingResultPanel.module.css";

interface Payload { metadata: AgentMetadata; departmentRun: StoredDepartmentResult | null }

export function DepartmentResultPanel({ sessionId }: { sessionId: string }) {
  const { locale, t } = useI18n();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [reviewing, setReviewing] = useState<MeetingReviewDecision | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/agent-sessions/${encodeURIComponent(sessionId)}/metadata`, { cache: "no-store", signal });
      const body = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setPayload(body);
      setError(null);
      return body.departmentRun?.status;
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : String(cause));
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

  const run = payload?.departmentRun;
  const submitReview = async (decision: MeetingReviewDecision) => {
    if (!run || reviewing) return;
    setReviewing(decision);
    setError(null);
    try {
      const response = await fetch(`/api/department-agent/runs/${encodeURIComponent(run.runId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ...(comment.trim() ? { comment: comment.trim() } : {}) }),
      });
      const body = await response.json() as { departmentRun?: StoredDepartmentResult; error?: string };
      if (!response.ok || !body.departmentRun) throw new Error(body.error || `HTTP ${response.status}`);
      setPayload((current) => current ? { ...current, departmentRun: body.departmentRun! } : current);
      setComment("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReviewing(null);
    }
  };

  if (error && !run) return <div className={s.state} role="status">{error}</div>;
  if (!run || run.status === "running") return <div className={s.state}><div className={s.stateCard}><strong>{t("departmentResult.generating")}</strong><p>{t("departmentResult.generatingHint")}</p></div></div>;
  if (run.status === "failed" || run.result === undefined) return <div className={s.state}><div className={`${s.stateCard} ${s.failed}`}><strong>{t("departmentResult.failed")}</strong><p>{run.error || t("departmentResult.failedHint")}</p></div></div>;

  return <div className={s.panel} data-testid="department-result-panel">
    <header className={s.hero}><span>DTA · DEPARTMENT RESULT</span><h2>{payload?.metadata.displayName ?? run.agentId}</h2><p>{t("departmentResult.subtitle")}</p></header>
    <section className={s.review} data-review-status={run.reviewStatus}>
      <div className={s.reviewHeading}><div><span>{t("meetingReview.controlPlane")}</span><h3>{t(`meetingReview.status.${run.reviewStatus}`)}</h3></div><strong>{t("meetingReview.revision").replace("{revision}", String(run.revision))}</strong></div>
      <p>{t(`departmentReview.hint.${run.reviewStatus}`)}</p>
      {(run.reviewStatus === "needs_review" || run.reviewStatus === "approved") && <>
        <label htmlFor={`department-review-${run.runId}`}>{t("meetingReview.comment")}</label>
        <textarea id={`department-review-${run.runId}`} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("meetingReview.commentPlaceholder")} disabled={Boolean(reviewing)} maxLength={5_000} />
        <div className={s.reviewActions}>
          {run.reviewStatus === "needs_review" && <button type="button" className={s.approve} disabled={Boolean(reviewing)} onClick={() => void submitReview("approved")}>{reviewing === "approved" ? t("meetingReview.saving") : t("meetingReview.approve")}</button>}
          <button type="button" disabled={Boolean(reviewing) || !comment.trim()} onClick={() => void submitReview("changes_requested")}>{t("meetingReview.requestChanges")}</button>
          <button type="button" className={s.reject} disabled={Boolean(reviewing) || !comment.trim()} onClick={() => void submitReview("rejected")}>{t("meetingReview.reject")}</button>
        </div>
      </>}
      {error && <div className={s.reviewError} role="alert">{error}</div>}
      {run.reviewHistory.length > 0 && <details className={s.reviewHistory}><summary>{t("meetingReview.history")} · {run.reviewHistory.length}</summary><ol>{[...run.reviewHistory].reverse().map((entry, index) => <li key={`${entry.reviewedAt}-${index}`}><strong>{t(`meetingReview.status.${entry.status}`)}</strong><small>{entry.actorId} · {new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.reviewedAt))}</small>{entry.comment && <p>{entry.comment}</p>}</li>)}</ol></details>}
    </section>
    <section><h3>{t("departmentResult.structured")}</h3><pre className={s.structuredResult}>{JSON.stringify(run.result, null, 2)}</pre></section>
    <section><h3>{t("meetingResult.artifacts")} <span>{run.artifacts.length}</span></h3><div className={s.artifacts}>{run.artifacts.map((artifact) => <a key={artifact.id} href={`/api/artifacts/${encodeURIComponent(artifact.id)}`} target="_blank" rel="noreferrer"><span>{artifact.type === "department_document" ? "DOC" : "JSON"}</span><strong>{artifact.title}</strong></a>)}</div></section>
    <WorkflowActionsPanel agentId={run.agentId} sourceRunId={run.runId} sourceVersion={`${run.revision}:${run.reviewStatus}:${run.updatedAt}`} />
    <section><h3>{t("pmResult.recommendedActions")} <span>{run.actions.length}</span></h3>{run.actions.length === 0 ? <p className={s.empty}>{t("pmResult.noActions")}</p> : <ul>{run.actions.map((action, index) => <li key={`${action.type}-${action.target ?? index}`}><strong>{action.target || action.type}</strong>{action.reason && <p>{action.reason}</p>}<small>{action.type}</small></li>)}</ul>}</section>
  </div>;
}
