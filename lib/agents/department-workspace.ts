import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";

export interface ManagedDepartmentWorkspace {
  id: string;
  displayName: string;
  cwd: string;
}

export async function ensureManagedDepartmentWorkspace(agentId: string, displayName: string): Promise<ManagedDepartmentWorkspace> {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(agentId)) throw new Error("Invalid department Agent id");
  const cwd = join(getDtaDataDir(), "workspaces", agentId);
  await mkdir(cwd, { recursive: true, mode: 0o700 });
  globalThis.__piAllowedRootsCache?.roots.add(cwd);
  return { id: `dta-${agentId}`, displayName: `DTA ${displayName} Space`, cwd };
}
