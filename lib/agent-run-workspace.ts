import { listWorktrees } from "./worktrees";
import type { AgentRunWorkspace } from "./agent-run-types";

export async function inspectAgentRunWorkspace(cwd: string): Promise<AgentRunWorkspace> {
  const worktrees = await listWorktrees(cwd);
  const current = worktrees.find((worktree) => worktree.path === cwd);
  return {
    repoRoot: worktrees[0]?.path ?? cwd,
    branch: current?.branch ?? null,
    isMain: current?.isMain ?? true,
  };
}
