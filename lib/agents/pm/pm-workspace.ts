import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";

export interface ManagedPMWorkspace {
  id: string;
  displayName: string;
  cwd: string;
}

export async function ensureManagedPMWorkspace(): Promise<ManagedPMWorkspace> {
  const cwd = join(getDtaDataDir(), "workspaces", "pm");
  await mkdir(cwd, { recursive: true, mode: 0o700 });
  globalThis.__piAllowedRootsCache?.roots.add(cwd);
  return { id: "dta-pm", displayName: "DTA PM Space", cwd };
}
