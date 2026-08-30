import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const understandMeetingMedia = vi.hoisted(() => vi.fn());
vi.mock("../agents/meeting/meeting-media-pipeline", () => ({ understandMeetingMedia }));

import { MeetingMediaJobRunner } from "../agents/meeting/meeting-media-job-runner";
import { readMeetingMediaJob } from "../agents/meeting/meeting-media-job-store";

const ORIGINAL_ENV = { ...process.env };
let root = "";

async function waitFor(id: string, status: string, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = readMeetingMediaJob(id);
    if (job?.status === status) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${status}`);
}

function success() {
  return {
    content: "# Timeline\n\n[00:00:01] Pilot approved.",
    chars: 42,
    transcriptArtifactId: "transcript-1",
    keyframeArtifactIds: [],
    transcriptSegmentCount: 1,
    keyframeCount: 0,
    transcriptionStatus: "ready",
    visionStatus: "not_applicable",
    warnings: [],
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dta-media-jobs-"));
  process.env.DTA_DATA_DIR = root;
  process.env.DTA_MEDIA_JOB_CONCURRENCY = "1";
  process.env.DTA_MEDIA_JOB_MAX_ATTEMPTS = "2";
  understandMeetingMedia.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  rmSync(root, { recursive: true, force: true });
});

describe("durable Meeting media jobs", () => {
  it("persists progress and a completed evidence result", async () => {
    understandMeetingMedia.mockImplementation(async (_input, _dependencies, control) => {
      await control.onProgress({ stage: "transcribing", percent: 50, message: "Transcribing" });
      return success();
    });
    const runner = new MeetingMediaJobRunner();
    const queued = runner.enqueue({ sourceArtifactId: "source-1", name: "sync.mp3", size: 100, kind: "audio", ownership: { userId: "user-a", runId: "meeting-run-1" } });
    const completed = await waitFor(queued.id, "completed");
    expect(completed).toMatchObject({ attempts: 1, userId: "user-a", runId: "meeting-run-1", progress: { stage: "completed", percent: 100 }, result: { transcriptArtifactId: "transcript-1", ok: true } });
  });

  it("supports bounded retry after a visible failure", async () => {
    understandMeetingMedia.mockRejectedValueOnce(new Error("temporary transcription outage")).mockResolvedValueOnce(success());
    const runner = new MeetingMediaJobRunner();
    const queued = runner.enqueue({ sourceArtifactId: "source-2", name: "sync.mp3", size: 100, kind: "audio", ownership: { userId: "user-a" } });
    expect(await waitFor(queued.id, "failed")).toMatchObject({ attempts: 1, error: "temporary transcription outage" });
    runner.retry(queued.id);
    expect(await waitFor(queued.id, "completed")).toMatchObject({ attempts: 2 });
    expect(() => runner.retry(queued.id)).toThrow(/Only failed or cancelled/);
  });

  it("keeps cancellation durable while the pipeline unwinds", async () => {
    understandMeetingMedia.mockImplementation(async (_input, _dependencies, control) => new Promise((_resolve, reject) => {
      control.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
    }));
    const runner = new MeetingMediaJobRunner();
    const queued = runner.enqueue({ sourceArtifactId: "source-3", name: "sync.mp4", size: 100, kind: "video", ownership: { userId: "user-a" } });
    await waitFor(queued.id, "processing");
    runner.cancel(queued.id);
    expect(await waitFor(queued.id, "cancelled")).toMatchObject({ progress: { stage: "cancelled" }, error: "Cancelled by the user" });
  });
});
