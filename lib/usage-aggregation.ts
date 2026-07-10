// Usage aggregation for the analytics report. Deliberately defensive: real
// session files contain assistant messages whose usage is partial — an
// errored run (e.g. a 429) records `{ input: 0, output: 0 }` with no `cost`
// at all — and one such message must not crash or NaN-poison the report.

export interface AssistantUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}

/** What actually appears in session files — any field may be missing. */
export type PartialUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number };
};

export function emptyUsage(): AssistantUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}

export function addUsage(target: AssistantUsage, src: PartialUsage | null | undefined): void {
  if (!src) return;
  target.input += src.input ?? 0;
  target.output += src.output ?? 0;
  target.cacheRead += src.cacheRead ?? 0;
  target.cacheWrite += src.cacheWrite ?? 0;
  target.cost.input += src.cost?.input ?? 0;
  target.cost.output += src.cost?.output ?? 0;
  target.cost.cacheRead += src.cost?.cacheRead ?? 0;
  target.cost.cacheWrite += src.cost?.cacheWrite ?? 0;
  target.cost.total += src.cost?.total ?? 0;
}
