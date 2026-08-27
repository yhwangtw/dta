"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import s from "./MeetingResultPanel.module.css";

interface WorkflowEntry {
  id: string;
  displayName: string;
  description: string;
  provider: "none" | "mock" | "n8n";
  configured: boolean;
  enabled: boolean;
  available: boolean;
  blockedReason?: string;
  idempotencyKey?: string;
}

interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed";
  completedAt?: string;
  error?: string;
}

interface CatalogPayload {
  provider: "none" | "mock" | "n8n";
  enabled: boolean;
  editorUrl?: string;
  workflows: WorkflowEntry[];
  executions: WorkflowExecution[];
}

interface Props {
  agentId: string;
  sourceRunId: string;
  sourceVersion?: string;
}

export function WorkflowActionsPanel({ agentId, sourceRunId, sourceVersion }: Props) {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { type: "success" | "error"; message: string }>>({});

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams({ agentId, sourceRunId });
      const response = await fetch(`/api/workflows?${params}`, { cache: "no-store", signal });
      const body = await response.json() as Partial<CatalogPayload> & { error?: unknown };
      if (!response.ok || !Array.isArray(body.workflows) || !Array.isArray(body.executions)) return;
      setCatalog(body as CatalogPayload);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setCatalog(null);
    }
  }, [agentId, sourceRunId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, sourceVersion]);

  const latestExecutions = useMemo(() => new Map(
    (catalog?.executions ?? []).map((execution) => [execution.workflowId, execution]),
  ), [catalog?.executions]);

  const execute = async (workflow: WorkflowEntry) => {
    if (!workflow.available || running) return;
    setRunning(workflow.id);
    setFeedback((current) => {
      const next = { ...current };
      delete next[workflow.id];
      return next;
    });
    try {
      const response = await fetch(`/api/workflows/${encodeURIComponent(workflow.id)}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(workflow.idempotencyKey ? { "Idempotency-Key": workflow.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          agentId,
          sourceRunId,
          reason: "Explicitly executed from the DTA result control plane.",
        }),
      });
      const body = await response.json() as { execution?: WorkflowExecution; replayed?: boolean; error?: { message?: string } | string };
      if (!response.ok || !body.execution) {
        const message = typeof body.error === "string" ? body.error : body.error?.message;
        throw new Error(message || `HTTP ${response.status}`);
      }
      setFeedback((current) => ({
        ...current,
        [workflow.id]: { type: "success", message: body.replayed ? t("workflow.replayed") : t("workflow.completed") },
      }));
      await load();
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [workflow.id]: { type: "error", message: error instanceof Error ? error.message : String(error) },
      }));
    } finally {
      setRunning(null);
    }
  };

  if (!catalog || catalog.workflows.length === 0) return null;

  return <section className={s.workflows} data-testid="workflow-actions-panel">
    <div className={s.workflowHeader}>
      <div>
        <span>DTA · N8N</span>
        <h3>{t("workflow.title")} <span>{catalog.workflows.length}</span></h3>
      </div>
      {catalog.editorUrl && <a href={catalog.editorUrl} target="_blank" rel="noreferrer">{t("workflow.openBuilder")}</a>}
    </div>
    <p className={s.workflowHint}>{catalog.provider === "n8n" ? t("workflow.n8nHint") : catalog.provider === "mock" ? t("workflow.mockHint") : t("workflow.disabledHint")}</p>
    <ul>{catalog.workflows.map((workflow) => {
      const previous = latestExecutions.get(workflow.id);
      const state = feedback[workflow.id];
      return <li key={workflow.id}>
        <div className={s.workflowCopy}>
          <strong>{workflow.displayName}</strong>
          <p>{workflow.description}</p>
          {!workflow.available && workflow.blockedReason && <small>{workflow.blockedReason}</small>}
          {previous?.status === "completed" && <small className={s.workflowSuccess}>{t("workflow.lastCompleted")}</small>}
          {previous?.status === "failed" && <small className={s.workflowFailure}>{previous.error || t("workflow.failed")}</small>}
          {state && <small className={state.type === "success" ? s.workflowSuccess : s.workflowFailure} role="status">{state.message}</small>}
        </div>
        <button type="button" disabled={!workflow.available || Boolean(running) || previous?.status === "completed"} onClick={() => void execute(workflow)}>
          {running === workflow.id ? t("workflow.running") : previous?.status === "completed" ? t("workflow.completedButton") : t("workflow.run")}
        </button>
      </li>;
    })}</ul>
  </section>;
}
