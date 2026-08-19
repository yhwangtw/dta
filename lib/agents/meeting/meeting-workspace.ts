import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";

export interface ManagedMeetingWorkspace {
  id: string;
  displayName: string;
  cwd: string;
}

export async function ensureManagedMeetingWorkspace(): Promise<ManagedMeetingWorkspace> {
  const cwd = join(getDtaDataDir(), "workspaces", "meetings");
  await mkdir(cwd, { recursive: true, mode: 0o700 });
  globalThis.__piAllowedRootsCache?.roots.add(cwd);
  return {
    id: "dta-meetings",
    displayName: "DTA Meeting Space",
    cwd,
  };
}
