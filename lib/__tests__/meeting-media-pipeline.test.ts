import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { understandMeetingMedia } from "../agents/meeting/meeting-media-pipeline";
import { LocalArtifactStore } from "../integrations/storage/local-artifact-store";
import type { MediaProcessor } from "../integrations/media/media-processor";
import type { TranscriptionProvider } from "../integrations/transcription/transcription-provider";
import type { VisionProvider } from "../integrations/vision/vision-provider";

describe("meeting media pipeline", () => {
  it("combines video transcript and visual evidence into traceable artifacts", async () => {
    const store = new LocalArtifactStore(mkdtempSync(join(tmpdir(), "dta-media-pipeline-")));
    const source = await store.put({ type: "meeting_media", title: "demo.mp4", mimeType: "video/mp4", data: new Uint8Array([1, 2, 3]), metadata: { originalName: "demo.mp4" } });
    const mediaProcessor: MediaProcessor = {
      name: "fake-ffmpeg",
      available: true,
      async probe() { return { durationSeconds: 90, hasAudio: true, hasVideo: true, width: 1280, height: 720 }; },
      async extractAudio() { return { data: new Uint8Array([4, 5, 6]), fileName: "meeting-audio.mp3", mimeType: "audio/mpeg" }; },
      async extractKeyframes() { return [{ timestampSeconds: 30, data: new Uint8Array([7, 8]), mimeType: "image/jpeg" }]; },
    };
    const transcriptionProvider: TranscriptionProvider = {
      name: "fake-transcriber",
      available: true,
      async transcribe() { return { text: "Pilot approved", segments: [{ startSeconds: 28, endSeconds: 32, speaker: "Alex", text: "Pilot approved" }] }; },
    };
    const visionProvider: VisionProvider = {
      name: "fake-vision",
      available: true,
      async analyze() { return { observations: [{ timestampSeconds: 30, summary: "Approval slide", visibleText: "Approved" }] }; },
    };

    const result = await understandMeetingMedia({ artifactId: source.id, name: "demo.mp4", kind: "video" }, { store, mediaProcessor, transcriptionProvider, visionProvider });
    expect(result).toMatchObject({ transcriptionStatus: "ready", visionStatus: "ready", durationSeconds: 90, transcriptSegmentCount: 1, keyframeCount: 1 });
    expect(result.content).toContain("[00:28–00:32] Alex: Pilot approved");
    expect(result.content).toContain("[00:30] Approval slide · Visible text: Approved");
    expect(result.transcriptArtifactId).toEqual(expect.any(String));
    expect(result.visualAnalysisArtifactId).toEqual(expect.any(String));
    expect(result.timelineArtifactId).toEqual(expect.any(String));
    expect(result.keyframeArtifactIds).toHaveLength(1);
  });
});
