import { ensureAgentRunSupervisor } from "./lib/agent-run-supervisor";
import { ensureScheduleRunner } from "./lib/schedule-runner";

export function registerScheduleRunner(): void {
  ensureScheduleRunner();
  // Resume explicitly queued work from trusted projects when the long-lived
  // Node server starts. Active work from a previous process is never replayed:
  // the supervisor marks it interrupted to avoid duplicate tool side effects.
  ensureAgentRunSupervisor();
}
