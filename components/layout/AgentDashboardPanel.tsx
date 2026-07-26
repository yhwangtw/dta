"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { showToast } from "@/hooks/useToast";
import { useI18n } from "@/lib/i18n";
import {
  ACTIVE_AGENT_RUN_STATUSES,
  TERMINAL_AGENT_RUN_STATUSES,
  type AgentRun,
  type AgentRunsResponse,
} from "@/lib/agent-run-types";
import { AgentRunCard } from "./AgentRunCard";
import { AgentRunForm } from "./AgentRunForm";
import s from "./AgentDashboardPanel.module.css";

interface Props {
  defaultCwd: string | null;
  onOpenSession: (sessionId: string) => void | Promise<void>;
}

type Filter = "all" | "active" | "queued" | "done";

function projectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function AgentDashboardPanel({ defaultCwd, onOpenSession }: Props) {
  const { t } = useI18n();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [maxConcurrency, setMaxConcurrency] = useState(3);
  const [editorOpen, setEditorOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/agent-runs?limit=200", { cache: "no-store" });
      const body = await response.json() as Partial<AgentRunsResponse> & { error?: string };
      if (!response.ok || !body.runs) throw new Error(body.error || `HTTP ${response.status}`);
      setRuns(body.runs);
      setMaxConcurrency(body.maxConcurrency ?? 3);
      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      if (!quiet) showToast(t("agents.loadFailed"), { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 2_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const visibleRuns = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return runs.filter((run) => {
      if (filter === "active" && !ACTIVE_AGENT_RUN_STATUSES.has(run.status)) return false;
      if (filter === "queued" && run.status !== "queued") return false;
      if (filter === "done" && !TERMINAL_AGENT_RUN_STATUSES.has(run.status)) return false;
      if (!normalizedQuery) return true;
      return `${run.name}\n${run.cwd}\n${run.prompt}\n${run.workspace?.branch ?? ""}`
        .toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [filter, query, runs]);

  const groups = useMemo(() => {
    const grouped = new Map<string, AgentRun[]>();
    for (const run of visibleRuns) {
      const root = run.workspace?.repoRoot ?? run.cwd;
      const list = grouped.get(root) ?? [];
      list.push(run);
      grouped.set(root, list);
    }
    return [...grouped.entries()];
  }, [visibleRuns]);

  const act = async (run: AgentRun, action: "cancel" | "retry") => {
    setBusyId(run.id);
    try {
      const response = await fetch(`/api/agent-runs/${encodeURIComponent(run.id)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      await load(true);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : t("agents.actionFailed"), { type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  if (editorOpen) {
    return (
      <AgentRunForm
        defaultCwd={defaultCwd}
        onCancel={() => setEditorOpen(false)}
        onCreated={(run) => {
          setRuns((current) => [run, ...current]);
          setEditorOpen(false);
          showToast(t("agents.started"), { type: "success" });
          void load(true);
        }}
      />
    );
  }

  const activeCount = runs.filter((run) => ACTIVE_AGENT_RUN_STATUSES.has(run.status)).length;
  const queuedCount = runs.filter((run) => run.status === "queued").length;
  const doneCount = runs.filter((run) => TERMINAL_AGENT_RUN_STATUSES.has(run.status)).length;

  return (
    <section className={s.container} aria-label={t("agents.title")} data-testid="agent-dashboard">
      <div className={`${s.header} chrome-mono`}>
        <strong>{t("agents.title")}</strong>
        <span className={`${s.daemonIndicator} ${error ? s.daemonOffline : ""}`}><i /> daemon</span>
        <button className={s.newButton} type="button" onClick={() => setEditorOpen(true)} disabled={!defaultCwd}>
          <span aria-hidden="true">＋</span>{t("agents.new")}
        </button>
      </div>
      <div className={s.summary} aria-label="Agent run summary">
        <button className={filter === "active" ? s.summaryActive : ""} onClick={() => setFilter(filter === "active" ? "all" : "active")}>
          <strong>{activeCount}</strong><span>{t("agents.active")}</span>
        </button>
        <button className={filter === "queued" ? s.summaryActive : ""} onClick={() => setFilter(filter === "queued" ? "all" : "queued")}>
          <strong>{queuedCount}</strong><span>{t("agents.queued")}</span>
        </button>
        <button className={filter === "done" ? s.summaryActive : ""} onClick={() => setFilter(filter === "done" ? "all" : "done")}>
          <strong>{doneCount}</strong><span>{t("agents.done")}</span>
        </button>
        <div><strong>{maxConcurrency}</strong><span>{t("agents.concurrency")}</span></div>
      </div>
      <div className={s.filterBar}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("agents.search")} aria-label={t("agents.search")} />
        {(query || filter !== "all") && <button type="button" onClick={() => { setQuery(""); setFilter("all"); }} aria-label="Clear filters">×</button>}
      </div>
      <div className={s.body}>
        {error && <div className={s.listError} role="alert">{error}</div>}
        {loading ? (
          <div className={s.skeleton} aria-busy="true"><span /><span /><span /></div>
        ) : groups.length === 0 ? (
          <div className={s.empty}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6M9 13h4"/><path d="M8 2v2M16 2v2M8 20v2M16 20v2"/></svg>
            <strong>{t("agents.empty")}</strong>
            <span>{t("agents.emptyHint")}</span>
            {defaultCwd && <button className={s.primaryButton} type="button" onClick={() => setEditorOpen(true)}>{t("agents.new")}</button>}
          </div>
        ) : (
          <div className={s.groups}>
            {groups.map(([root, projectRuns]) => (
              <section className={s.group} key={root}>
                <div className={s.groupHeader}>
                  <strong>{projectName(root)}</strong>
                  <span className="chrome-mono">{projectRuns.length}</span>
                </div>
                <div className={s.groupPath} title={root}>{root}</div>
                <div className={s.runList}>
                  {projectRuns.map((run) => (
                    <AgentRunCard
                      key={run.id}
                      run={run}
                      busy={busyId === run.id}
                      onCancel={(item) => void act(item, "cancel")}
                      onRetry={(item) => void act(item, "retry")}
                      onOpenSession={onOpenSession}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
