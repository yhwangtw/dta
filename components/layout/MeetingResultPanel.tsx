"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import type { StoredMeetingResult } from "@/lib/agents/meeting/meeting-types";
import { useI18n } from "@/lib/i18n";
import s from "./MeetingResultPanel.module.css";

interface Props {
  sessionId: string;
}

interface Payload {
  metadata: AgentMetadata;
  meetingRun: StoredMeetingResult | null;
}

export function MeetingResultPanel({ sessionId }: Props) {
  const { locale, t } = useI18n();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      <section>
        <h3>{t("meetingResult.decisions")} <span>{result.decisions.length}</span></h3>
        {result.decisions.length === 0 ? <p className={s.empty}>{t("meetingResult.none")}</p> : (
          <ol>{result.decisions.map((decision, index) => <li key={`${decision.text}-${index}`}><strong>{decision.text}</strong>{decision.owner && <small>{t("meetingResult.owner")}: {decision.owner}</small>}</li>)}</ol>
        )}
      </section>

      <section>
        <h3>{t("meetingResult.actions")} <span>{result.actionItems.length}</span></h3>
        {result.actionItems.length === 0 ? <p className={s.empty}>{t("meetingResult.none")}</p> : (
          <ul>{result.actionItems.map((item, index) => <li key={`${item.title}-${index}`}><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}<small>{[item.owner && `${t("meetingResult.owner")}: ${item.owner}`, item.dueDate && `${t("meetingResult.due")}: ${item.dueDate}`].filter(Boolean).join(" · ") || t("meetingResult.unassigned")}</small></li>)}</ul>
        )}
      </section>

      <section>
        <h3>{t("meetingResult.requirements")} <span>{result.requirements.length}</span></h3>
        {result.requirements.length === 0 ? <p className={s.empty}>{t("meetingResult.none")}</p> : (
          <ul>{result.requirements.map((requirement, index) => <li key={`${requirement.title}-${index}`}><strong>{requirement.title}</strong><p>{requirement.description}</p></li>)}</ul>
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
