import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureManagedMeetingWorkspace } from "../agents/meeting/meeting-workspace";

const originalDataDir = process.env.DTA_DATA_DIR;

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.DTA_DATA_DIR;
  else process.env.DTA_DATA_DIR = originalDataDir;
});

describe("managed Meeting workspace", () => {
  it("creates a DTA-owned runtime directory without user path input", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "dta-managed-workspace-"));
    process.env.DTA_DATA_DIR = dataDir;
    const workspace = await ensureManagedMeetingWorkspace();

    expect(workspace).toMatchObject({ id: "dta-meetings", displayName: "DTA Meeting Space" });
    expect(workspace.cwd).toBe(join(dataDir, "workspaces", "meetings"));
    expect(statSync(workspace.cwd).isDirectory()).toBe(true);
  });
});
