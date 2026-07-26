import { realpath } from "node:fs/promises";
import { listWorktrees } from "./worktrees";
import type { AgentRunWorkspace } from "./agent-run-types";
import { getAllowedRoots, isPathAllowed } from "./file-security";

export async function isTrustedAgentRunWorkspace(
  cwd: string,
  allowedRoots?: Set<string>,
): Promise<boolean> {
  const roots = allowedRoots ?? await getAllowedRoots();
  if (!isPathAllowed(cwd, roots)) return false;

  try {
    const canonicalCwd = await realpath(cwd);
    const canonicalRoots = new Set<string>();
    await Promise.all([...roots].map(async (root) => {
      try {
        canonicalRoots.add(await realpath(root));
      } catch {
        // Missing roots cannot authorize a real workspace.
      }
    }));
    return isPathAllowed(canonicalCwd, canonicalRoots);
  } catch {
    return false;
  }
}

export async function inspectAgentRunWorkspace(cwd: string): Promise<AgentRunWorkspace> {
  const worktrees = await listWorktrees(cwd);
  const current = worktrees.find((worktree) => worktree.path === cwd);
  return {
    repoRoot: worktrees[0]?.path ?? cwd,
    branch: current?.branch ?? null,
    isMain: current?.isMain ?? true,
  };
}
