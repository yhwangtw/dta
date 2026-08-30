"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import type { MeetingReviewDecision, MeetingTraceability, StoredMeetingResult } from "@/lib/agents/meeting/meeting-types";
import { useI18n } from "@/lib/i18n";
import { WorkflowActionsPanel } from "./WorkflowActionsPanel";
import s from "./MeetingResultPanel.module.css";

interface Props {
  sessionId: string;
}

interface Payload {
  metadata: AgentMetadata;
  meetingRun: StoredMeetingResult | null;
}

const REVIEW_STATUS_KEY = {
  draft: "meetingReview.status.draft",
  needs_review: "meetingReview.status.needs_review",
  approved: "meetingReview.status.approved",
  changes_requested: "meetingReview.status.changes_requested",
  rejected: "meetingReview.status.rejected",
} as const;

const REVIEW_HINT_KEY = {
  draft: "meetingReview.hint.draft",
  needs_review: "meetingReview.hint.needs_review",
  approved: "meetingReview.hint.approved",
  changes_requested: "meetingReview.hint.changes_requested",
  rejected: "meetingReview.hint.rejected",
} as const;

function Traceability({ item, t }: { item: MeetingTraceability; t: ReturnType<typeof useI18n>["t"] }) {
  return <div className={s.traceability} data-needs-confirmation={item.needsConfirmation}>
    <div className={s.traceMeta}>
      <code>{item.id}</code>
      <span>{t("meetingResult.confidence").replace("{confidence}", `${Math.round(item.confidence * 100)}%`)}</span>
      {item.needsConfirmation && <strong>{t("meetingResult.needsConfirmation")}</strong>}
    </div>
    {item.evidence.length > 0 ? <details>
      <summary>{t("meetingResult.evidence").replace("{count}", String(item.evidence.length))}</summary>
      <ul>{item.evidence.map((evidence, index) => <li key={`${item.id}-evidence-${index}`}>
        <small>{[evidence.timestamp, evidence.speaker, evidence.source, evidence.artifactId].filter(Boolean).join(" · ")}</small>
        {evidence.excerpt && <q>{evidence.excerpt}</q>}
      </li>)}</ul>
    </details> : <small>{t("meetingResult.noEvidence")}</small>}
  </div>;
}

export function MeetingResultPanel({ sessionId }: Props) {
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
      return body.meetingRun?.status ?? null;
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return null;
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    }
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const controller = new AbortController();
    const poll = async () => {
      const status = await load(controller.signal);
      if (active && status !== "completed" && status !== "failed") {
        timer = window.setTimeout(poll, 1_500);
      }
    };
    void poll();
    return () => {
      active = false;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [load]);

  const run = payload?.meetingRun;
  const result = run?.result;
  const handoffs = run?.actions?.filter((action) => action.type === "handoff") ?? [];

  const submitReview = async (decision: MeetingReviewDecision) => {
    if (!run || reviewing) return;
    setReviewing(decision);
    setReviewError(null);
    try {
      const response = await fetch(`/api/meeting-agent/runs/${encodeURIComponent(run.runId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ...(reviewComment.trim() ? { comment: reviewComment.trim() } : {}) }),
      });
      const body = await response.json() as { meetingRun?: StoredMeetingResult; error?: string };
      if (!response.ok || !body.meetingRun) throw new Error(body.error || `HTTP ${response.status}`);
      setPayload((current) => current ? { ...current, meetingRun: body.meetingRun! } : current);
      setReviewComment("");
    } catch (cause) {
      setReviewError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReviewing(null);
    }
  };

  if (error) return <div className={s.state} role="status">{error}</div>;
  if (!run || run.status === "running") {
    return <div className={s.state}>
      <div className={s.stateCard}>
        <span className={s.conversationIcon} aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" /><path d="M8 8h8M8 12h5" /></svg>
        </span>
        <strong>{t("meetingResult.conversationActive")}</strong>
        <p>{t("meetingResult.conversationHint")}</p>
      </div>
    </div>;
  }
  if (run.status === "failed" || !result) {
    const friendlyError = run.error?.toLowerCase().includes("without publishing a structured result")
      ? t("meetingResult.incompleteHint")
      : run.error;
    return <div className={s.state} role="status">
      <div className={`${s.stateCard} ${s.failed}`}>
        <span className={s.warningIcon} aria-hidden>!</span>
        <strong>{t("meetingResult.incomplete")}</strong>
        <p>{friendlyError || (locale === "zh" ? "請回到會議對話確認內容。" : "Return to the meeting conversation to review it.")}</p>
      </div>
    </div>;
  }

  return (
    <div className={s.panel} data-testid="meeting-result-panel">
      <header className={s.hero}>
        <span>DTA · MEETING RESULT</span>
        <h2>{result.title || t("meetingResult.title")}</h2>
        <p>{result.summary}</p>
      </header>

      <section className={s.review} data-review-status={run.reviewStatus}>
        <div className={s.reviewHeading}>
          <div>
            <span>{t("meetingReview.controlPlane")}</span>
            <h3>{t(REVIEW_STATUS_KEY[run.reviewStatus])}</h3>
          </div>
          <strong>{t("meetingReview.revision").replace("{revision}", String(run.revision))}</strong>
        </div>
        <p>{t(REVIEW_HINT_KEY[run.reviewStatus])}</p>
        {(run.reviewStatus === "needs_review" || run.reviewStatus === "approved") && <>
          <label htmlFor={`meeting-review-${run.runId}`}>{t("meetingReview.comment")}</label>
          <textarea
            id={`meeting-review-${run.runId}`}
            value={reviewComment}
            onChange={(event) => setReviewComment(event.target.value)}
            placeholder={t("meetingReview.commentPlaceholder")}
            disabled={Boolean(reviewing)}
            maxLength={5_000}
          />
          <div className={s.reviewActions}>
            {run.reviewStatus === "needs_review" && <button type="button" className={s.approve} disabled={Boolean(reviewing)} onClick={() => void submitReview("approved")}>{reviewing === "approved" ? t("meetingReview.saving") : t("meetingReview.approve")}</button>}
            <button type="button" disabled={Boolean(reviewing) || !reviewComment.trim()} onClick={() => void submitReview("changes_requested")}>{reviewing === "changes_requested" ? t("meetingReview.saving") : t("meetingReview.requestChanges")}</button>
            <button type="button" className={s.reject} disabled={Boolean(reviewing) || !reviewComment.trim()} onClick={() => void submitReview("rejected")}>{reviewing === "rejected" ? t("meetingReview.saving") : t("meetingReview.reject")}</button>
          </div>
        </>}
        {reviewError && <div className={s.reviewError} role="alert">{reviewError}</div>}
        {run.reviewHistory.length > 0 && <details className={s.reviewHistory}>
          <summary>{t("meetingReview.history")} · {run.reviewHistory.length}</summary>
          <ol>{[...run.reviewHistory].reverse().map((entry, index) => <li key={`${entry.reviewedAt}-${index}`}>
            <strong>{t(REVIEW_STATUS_KEY[entry.status])}</strong>
            <small>{entry.actorId} · {new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.reviewedAt))}</small>
            {entry.comment && <p>{entry.comment}</p>}
          </li>)}</ol>
        </details>}
      </section>

      <WorkflowActionsPanel agentId="meeting-agent" sourceRunId={run.runId} sourceVersion={`${run.revision}:${run.reviewStatus}:${run.updatedAt}`} />

      {handoffs.length > 0 && <section className={s.handoffs}>
        <h3>{t("meetingResult.handoffs")} <span>{handoffs.length}</span></h3>
        <p className={s.handoffHint}>{run.reviewStatus === "approved" ? t("meetingResult.handoffReleased") : t("meetingResult.handoffPending")}</p>
        <ul>{handoffs.map((handoff, index) => <li key={`${handoff.target ?? "agent"}-${index}`}>
          <div>
            <small>{t("meetingResult.nextAgent")}</small>
            <strong>{handoff.target === "pm-agent" ? "PM Agent" : handoff.target || t("meetingResult.agentUnspecified")}</strong>
          </div>
          <span data-released={run.reviewStatus === "approved"}>{run.reviewStatus === "approved" ? t("meetingResult.readyForOrchestrator") : t("meetingResult.awaitingApproval")}</span>
          {handoff.reason && <p>{handoff.reason}</p>}
        </li>)}</ul>
      </section>}

      <section>
        <h3>{t("meetingResult.decisions")} <span>{result.decisions.length}</span></h3>
        {result.decisions.length === 0 ? <p className={s.empty}>{t("meetingResult.none")}</p> : (
          <ol>{result.decisions.map((decision) => <li key={decision.id}><strong>{decision.text}</strong>{decision.owner && <small>{t("meetingResult.owner")}: {decision.owner}</small>}<Traceability item={decision} t={t} /></li>)}</ol>
        )}
      </section>

      <section>
        <h3>{t("meetingResult.actions")} <span>{result.actionItems.length}</span></h3>
        {result.actionItems.length === 0 ? <p className={s.empty}>{t("meetingResult.none")}</p> : (
          <ul>{result.actionItems.map((item) => <li key={item.id}><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}<small>{[item.owner && `${t("meetingResult.owner")}: ${item.owner}`, item.dueDate && `${t("meetingResult.due")}: ${item.dueDate}`].filter(Boolean).join(" · ") || t("meetingResult.unassigned")}</small><Traceability item={item} t={t} /></li>)}</ul>
        )}
      </section>

      <section>
        <h3>{t("meetingResult.requirements")} <span>{result.requirements.length}</span></h3>
        {result.requirements.length === 0 ? <p className={s.empty}>{t("meetingResult.none")}</p> : (
          <ul>{result.requirements.map((requirement) => <li key={requirement.id}><strong>{requirement.title}</strong><p>{requirement.description}</p><Traceability item={requirement} t={t} /></li>)}</ul>
        )}
      </section>

      <section>
        <h3>{t("meetingResult.artifacts")} <span>{run.artifacts.length}</span></h3>
        <div className={s.artifacts}>{run.artifacts.map((artifact) => (
          <a key={artifact.id} href={`/api/artifacts/${encodeURIComponent(artifact.id)}`} target="_blank" rel="noreferrer">
            <span>{artifact.type === "meeting_minutes" ? "MD" : artifact.type === "transcript" ? "TXT" : "JSON"}</span>
            <strong>{artifact.title}</strong>
          </a>
        ))}</div>
      </section>
    </div>
  );
}
