import { describe, expect, it } from "vitest";
import { POST } from "../../app/api/meeting-agent/extract/route";
import { readMeetingMediaJob } from "../agents/meeting/meeting-media-job-store";

function requestWith(files: File[], scope: { runId?: string } = {}): Request {
  const form = new FormData();
  if (scope.runId) form.append("runId", scope.runId);
  for (const file of files) form.append("files", file);
  return new Request("http://localhost/api/meeting-agent/extract", { method: "POST", body: form });
}

async function waitForJob(id: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const job = readMeetingMediaJob(id);
    if (job && ["completed", "failed", "cancelled"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Media job ${id} did not finish`);
}

describe("POST /api/meeting-agent/extract", () => {
  it("extracts text meeting sources", async () => {
    const response = await POST(requestWith([
      new File(["[00:01] Alex: The pilot starts Monday."], "sync.vtt", { type: "text/vtt" }),
    ]));
    const body = await response.json() as { results: Array<{ ok: boolean; name: string; content: string; chars: number }> };

    expect(response.status).toBe(200);
    expect(body.results[0]).toMatchObject({ ok: true, name: "sync.vtt" });
    expect(body.results[0].content).toContain("pilot starts Monday");
    expect(body.results[0].chars).toBeGreaterThan(0);
  });

  it("rejects unsupported files without discarding supported files", async () => {
    const response = await POST(requestWith([
      new File(["valid notes"], "notes.txt", { type: "text/plain" }),
      new File(["%PDF"], "slides.pdf", { type: "application/pdf" }),
    ]));
    const body = await response.json() as { results: Array<{ ok: boolean; name: string; error?: string }> };

    expect(response.status).toBe(200);
    expect(body.results.find((result) => result.name === "notes.txt")?.ok).toBe(true);
    expect(body.results.find((result) => result.name === "slides.pdf")).toMatchObject({
      ok: false,
      error: "Unsupported meeting source format",
    });
  });

  it("requires multipart files", async () => {
    const response = await POST(new Request("http://localhost/api/meeting-agent/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }));
    expect(response.status).toBe(415);
  });

  it("stores media but reports that transcription is not configured", async () => {
    const previous = process.env.DTA_TRANSCRIPTION_PROVIDER;
    process.env.DTA_TRANSCRIPTION_PROVIDER = "none";
    try {
      const response = await POST(requestWith([
        new File([new Uint8Array([1, 2, 3])], "sync.mp3", { type: "audio/mpeg" }),
      ]));
      const body = await response.json() as { results: Array<Record<string, unknown>> };
      expect(response.status).toBe(202);
      expect(body.results[0]).toMatchObject({
        ok: true,
        kind: "audio",
        processingStatus: "queued",
      });
      expect(body.results[0].artifactId).toEqual(expect.any(String));
      const job = await waitForJob(String(body.results[0].jobId));
      expect(job.status).toBe("failed");
      expect(job.result).toMatchObject({ transcriptionStatus: "unavailable" });
      expect(String(job.error)).toContain("Transcription service is not configured");
    } finally {
      if (previous === undefined) delete process.env.DTA_TRANSCRIPTION_PROVIDER;
      else process.env.DTA_TRANSCRIPTION_PROVIDER = previous;
    }
  });

  it("turns uploaded audio into timestamped meeting evidence with the configured provider", async () => {
    const previousProvider = process.env.DTA_TRANSCRIPTION_PROVIDER;
    const previousTranscript = process.env.DTA_MOCK_TRANSCRIPT;
    process.env.DTA_TRANSCRIPTION_PROVIDER = "mock";
    process.env.DTA_MOCK_TRANSCRIPT = "[00:00] Alex: The pilot is approved.";
    try {
      const response = await POST(requestWith([
        new File([new Uint8Array([1, 2, 3])], "sync.mp3", { type: "audio/mpeg" }),
      ], { runId: "meeting-draft-123" }));
      const body = await response.json() as { results: Array<Record<string, unknown>> };
      expect(response.status).toBe(202);
      const job = await waitForJob(String(body.results[0].jobId));
      expect(job.status).toBe("completed");
      expect(job.runId).toBe("meeting-draft-123");
      expect(job.result).toMatchObject({
        ok: true,
        kind: "audio",
        transcriptionStatus: "ready",
        visionStatus: "not_applicable",
        transcriptSegmentCount: 1,
      });
      expect(String(job.result?.content)).toContain("Alex: The pilot is approved");
      expect(job.result?.transcriptArtifactId).toEqual(expect.any(String));
      expect(job.result?.timelineArtifactId).toEqual(expect.any(String));
    } finally {
      if (previousProvider === undefined) delete process.env.DTA_TRANSCRIPTION_PROVIDER;
      else process.env.DTA_TRANSCRIPTION_PROVIDER = previousProvider;
      if (previousTranscript === undefined) delete process.env.DTA_MOCK_TRANSCRIPT;
      else process.env.DTA_MOCK_TRANSCRIPT = previousTranscript;
    }
  });
});
