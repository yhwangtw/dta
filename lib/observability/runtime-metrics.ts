interface Labels { [key: string]: string }

interface Histogram {
  labels: Labels;
  count: number;
  sum: number;
  buckets: number[];
}

const DURATION_BUCKETS = [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 900, 1_800, 3_600];

interface RuntimeMetricState {
  counters: Map<string, { name: string; labels: Labels; value: number }>;
  gauges: Map<string, { name: string; labels: Labels; value: number }>;
  histograms: Map<string, Histogram & { name: string }>;
}

declare global {
  var __dtaRuntimeMetrics: RuntimeMetricState | undefined;
}

function state(): RuntimeMetricState {
  globalThis.__dtaRuntimeMetrics ??= { counters: new Map(), gauges: new Map(), histograms: new Map() };
  return globalThis.__dtaRuntimeMetrics;
}

function safe(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100) || "unknown";
}

function normalized(labels: Labels): Labels {
  return Object.fromEntries(Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [safe(key), safe(value)]));
}

function key(name: string, labels: Labels): string {
  return `${name}|${JSON.stringify(normalized(labels))}`;
}

function increment(name: string, labels: Labels, amount = 1): void {
  const metrics = state();
  const normalizedLabels = normalized(labels);
  const id = key(name, normalizedLabels);
  const current = metrics.counters.get(id);
  metrics.counters.set(id, { name, labels: normalizedLabels, value: (current?.value ?? 0) + Math.max(0, amount) });
}

function gauge(name: string, labels: Labels, delta: number): void {
  const metrics = state();
  const normalizedLabels = normalized(labels);
  const id = key(name, normalizedLabels);
  const current = metrics.gauges.get(id);
  metrics.gauges.set(id, { name, labels: normalizedLabels, value: Math.max(0, (current?.value ?? 0) + delta) });
}

function observe(name: string, labels: Labels, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const metrics = state();
  const normalizedLabels = normalized(labels);
  const id = key(name, normalizedLabels);
  const current = metrics.histograms.get(id) ?? { name, labels: normalizedLabels, count: 0, sum: 0, buckets: DURATION_BUCKETS.map(() => 0) };
  current.count += 1;
  current.sum += seconds;
  DURATION_BUCKETS.forEach((bucket, index) => { if (seconds <= bucket) current.buckets[index] += 1; });
  metrics.histograms.set(id, current);
}

export function recordAgentRunFinished(input: { agentId: string; status: string; durationMs?: number | null; inputTokens?: number; outputTokens?: number; cost?: number }): void {
  const labels = { agent_id: input.agentId, status: input.status };
  increment("dta_agent_run_finished_total", labels);
  if (input.durationMs !== null && input.durationMs !== undefined) observe("dta_agent_run_duration_seconds", labels, input.durationMs / 1_000);
  if (input.inputTokens) increment("dta_agent_tokens_total", { agent_id: input.agentId, direction: "input" }, input.inputTokens);
  if (input.outputTokens) increment("dta_agent_tokens_total", { agent_id: input.agentId, direction: "output" }, input.outputTokens);
  if (input.cost) increment("dta_agent_cost_currency_total", { agent_id: input.agentId }, input.cost);
}

export function recordMediaJobFinished(input: { kind: string; status: string; durationMs?: number }): void {
  const labels = { kind: input.kind, status: input.status };
  increment("dta_media_job_finished_total", labels);
  if (input.durationMs !== undefined) observe("dta_media_job_duration_seconds", labels, input.durationMs / 1_000);
}

export function recordWorkflowFinished(input: { workflowId: string; status: string; durationMs?: number; replayed?: boolean }): void {
  const labels = { workflow_id: input.workflowId, status: input.status, replayed: input.replayed ? "true" : "false" };
  increment("dta_workflow_execution_total", labels);
  if (input.durationMs !== undefined) observe("dta_workflow_duration_seconds", labels, input.durationMs / 1_000);
}

export function beginSseConnection(stream: "agent_run" | "pi_session" | "a2a", reconnect: boolean): () => void {
  const labels = { stream, reconnect: reconnect ? "true" : "false" };
  increment("dta_sse_connections_total", labels);
  gauge("dta_sse_connections_active", { stream }, 1);
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    gauge("dta_sse_connections_active", { stream }, -1);
  };
}

function labelText(labels: Labels): string {
  const values = Object.entries(labels).map(([name, value]) => `${name}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return values.length ? `{${values.join(",")}}` : "";
}

export function renderRuntimeMetrics(): string[] {
  const metrics = state();
  const lines: string[] = [];
  for (const metric of [...metrics.counters.values()].sort((a, b) => key(a.name, a.labels).localeCompare(key(b.name, b.labels)))) {
    lines.push(`${metric.name}${labelText(metric.labels)} ${metric.value}`);
  }
  for (const metric of [...metrics.gauges.values()].sort((a, b) => key(a.name, a.labels).localeCompare(key(b.name, b.labels)))) {
    lines.push(`${metric.name}${labelText(metric.labels)} ${metric.value}`);
  }
  for (const metric of [...metrics.histograms.values()].sort((a, b) => key(a.name, a.labels).localeCompare(key(b.name, b.labels)))) {
    DURATION_BUCKETS.forEach((bucket, index) => lines.push(`${metric.name}_bucket${labelText({ ...metric.labels, le: String(bucket) })} ${metric.buckets[index]}`));
    lines.push(`${metric.name}_bucket${labelText({ ...metric.labels, le: "+Inf" })} ${metric.count}`);
    lines.push(`${metric.name}_sum${labelText(metric.labels)} ${metric.sum}`);
    lines.push(`${metric.name}_count${labelText(metric.labels)} ${metric.count}`);
  }
  return lines;
}

export function resetRuntimeMetricsForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Runtime metrics reset is test-only");
  globalThis.__dtaRuntimeMetrics = undefined;
}
