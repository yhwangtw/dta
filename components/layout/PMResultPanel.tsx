"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import type { StoredPMResult } from "@/lib/agents/pm/pm-types";
import { useI18n } from "@/lib/i18n";
import { WorkflowActionsPanel } from "./WorkflowActionsPanel";
import s from "./MeetingResultPanel.module.css";

interface Props { sessionId: string }
interface Payload { metadata: AgentMetadata; pmRun: StoredPMResult | null }

export function PMResultPanel({ sessionId }: Props) {
  const { t } = useI18n();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  if (error) return <div className={s.state} role="status">{error}</div>;
  if (!run || run.status === "running") return <div className={s.state}><div className={s.stateCard}><strong>{t("pmResult.generating")}</strong><p>{t("pmResult.generatingHint")}</p></div></div>;
  if (run.status === "failed" || !run.result) return <div className={s.state}><div className={`${s.stateCard} ${s.failed}`}><strong>{t("pmResult.failed")}</strong><p>{run.error || t("pmResult.failedHint")}</p></div></div>;

  return <div className={s.panel} data-testid="pm-result-panel">
    <header className={s.hero}><span>DTA · PM RESULT</span><h2>{t("pmResult.title")}</h2><p>{run.result.requirementSummary}</p></header>
    <section>
      <h3>{t("pmResult.artifacts")} <span>{run.result.artifacts.length}</span></h3>
      <div className={s.artifacts}>{run.result.artifacts.map((artifact) => <a key={artifact.artifactId} href={`/api/artifacts/${encodeURIComponent(artifact.artifactId)}`} target="_blank" rel="noreferrer"><span>{artifact.type}</span><strong>{artifact.title}</strong></a>)}</div>
    </section>
    <WorkflowActionsPanel agentId="pm-agent" sourceRunId={run.runId} sourceVersion={run.updatedAt} />
    <section>
      <h3>{t("pmResult.recommendedActions")} <span>{run.actions.length}</span></h3>
      {run.actions.length === 0 ? <p className={s.empty}>{t("pmResult.noActions")}</p> : <ul>{run.actions.map((action, index) => <li key={`${action.type}-${action.target ?? index}`}><strong>{action.target || action.type}</strong>{action.reason && <p>{action.reason}</p>}<small>{action.type}</small></li>)}</ul>}
    </section>
  </div>;
}
