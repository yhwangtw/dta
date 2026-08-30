import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeMeetingRun, readMeetingRun } from "../agents/meeting/meeting-result-store";
import { createMeetingMediaJob, readMeetingMediaJob, updateMeetingMediaJob } from "../agents/meeting/meeting-media-job-store";
import { loadDtaConfig } from "../config/env";
import { runRetentionSweep } from "../governance/retention";
import { getArtifactStore } from "../integrations/storage/artifact-store-factory";

const ORIGINAL_ENV = { ...process.env };
let root = "";
const old = "2020-01-01T00:00:00.000Z";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dta-retention-"));
  process.env.DTA_DATA_DIR = root;
  process.env.PI_CODING_AGENT_DIR = join(root, "pi");
  process.env.DTA_ARTIFACT_STORE = "local";
  process.env.DTA_MEMORY_STORE = "local";
  process.env.DTA_RETENTION_ENABLED = "true";
  process.env.DTA_RETENTION_DRY_RUN = "true";
  process.env.DTA_ARTIFACT_RETENTION_DAYS = "1";
  process.env.DTA_RUN_RETENTION_DAYS = "1";
  process.env.DTA_MEDIA_JOB_RETENTION_DAYS = "1";
  process.env.DTA_WORKFLOW_RETENTION_DAYS = "1";
  process.env.DTA_MEMORY_TTL_SECONDS = "60";
  process.env.DTA_RETENTION_PROTECT_APPROVED = "true";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  rmSync(root, { recursive: true, force: true });
});

async function oldArtifact(title: string, runId: string) {
  const store = getArtifactStore();
  const reference = await store.put({ type: "meeting_minutes", title, mimeType: "text/markdown", data: title, metadata: { runId, userId: "user-a" } });
  const metadataPath = join(root, "artifacts", `${reference.id}.json`);
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  writeFileSync(metadataPath, JSON.stringify({ ...metadata, createdAt: old }));
  return { ...reference, createdAt: old };
}

describe("coordinated retention", () => {
  it("previews before deleting expired data and preserves approved or held records", async () => {
    const approvedId = randomUUID();
    const expiredId = randomUUID();
    const approvedArtifact = await oldArtifact("approved", approvedId);
    const approvedEvidence = await oldArtifact("approved evidence", approvedId);
    const expiredArtifact = await oldArtifact("expired", expiredId);
    writeMeetingRun({ runId: approvedId, status: "completed", result: { schemaVersion: "2.0", summary: "approved", decisions: [{ id: "decision_approved", text: "approved", evidence: [{ artifactId: approvedEvidence.id }], confidence: 1, needsConfirmation: false }], actionItems: [], requirements: [] }, artifacts: [approvedArtifact], actions: [], reviewStatus: "approved", revision: 1, reviewHistory: [], updatedAt: old });
    writeMeetingRun({ runId: expiredId, status: "completed", result: { schemaVersion: "2.0", summary: "expired", decisions: [], actionItems: [], requirements: [] }, artifacts: [expiredArtifact], actions: [], reviewStatus: "rejected", revision: 1, reviewHistory: [], updatedAt: old });

    const media = createMeetingMediaJob({ userId: "user-a", sourceArtifactId: expiredArtifact.id, name: "old.mp3", size: 10, kind: "audio", maxAttempts: 1 });
    updateMeetingMediaJob(media.id, (job) => ({ ...job, status: "failed", progress: { stage: "failed", percent: 100, message: "failed" }, finishedAt: old, updatedAt: old }));
    const protectedMedia = createMeetingMediaJob({ userId: "user-a", runId: approvedId, sourceArtifactId: approvedEvidence.id, name: "approved.mp3", size: 10, kind: "audio", maxAttempts: 1 });
    updateMeetingMediaJob(protectedMedia.id, (job) => ({ ...job, status: "completed", progress: { stage: "completed", percent: 100, message: "done" }, finishedAt: old, updatedAt: old }));
    mkdirSync(join(root, "memory"), { recursive: true });
    writeFileSync(join(root, "memory", "expired.json"), JSON.stringify({ version: 1, conversationId: "old", entries: [], updatedAt: old }));
    writeFileSync(join(root, "workflow-executions.json"), JSON.stringify({ version: 1, executions: [{ id: randomUUID(), idempotencyKey: "old", workflowId: "meeting-notify-teams", agentId: "meeting-agent", sourceRunId: expiredId, actorId: "user-a", status: "completed", reason: "old", requestedAt: old, completedAt: old }] }));

    const preview = await runRetentionSweep(loadDtaConfig());
    expect(preview).toMatchObject({ status: "completed", dryRun: true });
    expect(preview.deletedByType).toMatchObject({ artifacts: 1, runs: 1, mediaJobs: 1, workflows: 1, memoryFiles: 1 });
    expect(preview.protectedByType).toMatchObject({ artifacts: 2, runs: 1, mediaJobs: 1 });
    expect(preview.delegated).toContain("piSessions");
    expect(readMeetingRun(expiredId)).not.toBeNull();
    expect(readMeetingMediaJob(media.id)).not.toBeNull();

    process.env.DTA_RETENTION_DRY_RUN = "false";
    const executed = await runRetentionSweep(loadDtaConfig());
    expect(executed.dryRun).toBe(false);
    expect(readMeetingRun(expiredId)).toBeNull();
    expect(readMeetingRun(approvedId)).not.toBeNull();
    expect(readMeetingMediaJob(media.id)).toBeNull();
    expect(readMeetingMediaJob(protectedMedia.id)).not.toBeNull();
    expect(existsSync(join(root, "memory", "expired.json"))).toBe(false);
    await expect(getArtifactStore().get(expiredArtifact.id)).rejects.toThrow();
    await expect(getArtifactStore().get(approvedArtifact.id)).resolves.toMatchObject({ id: approvedArtifact.id });
  });

  it("does not delete old artifacts that are still referenced by a retained run or media job", async () => {
    const retainedRunId = randomUUID();
    const runArtifact = await oldArtifact("retained by current run", retainedRunId);
    const mediaArtifact = await oldArtifact("retained by current media", "media-draft");
    writeMeetingRun({
      runId: retainedRunId,
      status: "completed",
      result: { schemaVersion: "2.0", summary: "current", decisions: [], actionItems: [], requirements: [] },
      artifacts: [runArtifact],
      actions: [],
      reviewStatus: "rejected",
      revision: 1,
      reviewHistory: [],
      updatedAt: new Date().toISOString(),
    });
    const media = createMeetingMediaJob({ userId: "user-a", sourceArtifactId: mediaArtifact.id, name: "current.mp3", size: 10, kind: "audio", maxAttempts: 1 });

    process.env.DTA_RETENTION_DRY_RUN = "false";
    const executed = await runRetentionSweep(loadDtaConfig());

    expect(executed.protectedByType.artifacts).toBe(2);
    await expect(getArtifactStore().get(runArtifact.id)).resolves.toMatchObject({ id: runArtifact.id });
    await expect(getArtifactStore().get(mediaArtifact.id)).resolves.toMatchObject({ id: mediaArtifact.id });
    expect(readMeetingMediaJob(media.id)).not.toBeNull();
  });
});
