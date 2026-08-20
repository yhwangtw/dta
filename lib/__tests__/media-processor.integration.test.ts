import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FfmpegMediaProcessor } from "../integrations/media/media-processor";
import type { Artifact } from "../integrations/storage/artifact-store";

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

describe("FFmpeg media processor", () => {
  it.skipIf(!ffmpegAvailable)("probes video, extracts normalized audio, and samples keyframes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dta-ffmpeg-test-"));
    const videoPath = join(directory, "meeting.mp4");
    execFileSync("ffmpeg", [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=blue:s=320x240:d=6",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
      "-shortest", "-c:v", "mpeg4", "-c:a", "aac", videoPath,
    ]);
    const data = readFileSync(videoPath);
    const artifact: Artifact = {
      id: "22222222-2222-4222-8222-222222222222",
      type: "meeting_media",
      title: "meeting.mp4",
      mimeType: "video/mp4",
      size: data.byteLength,
      createdAt: "2026-08-20T00:00:00.000Z",
      data,
      metadata: { originalName: "meeting.mp4" },
    };
    const processor = new FfmpegMediaProcessor();
    const probe = await processor.probe(artifact);
    const audio = await processor.extractAudio(artifact);
    const frames = await processor.extractKeyframes(artifact, probe);
    expect(probe).toMatchObject({ hasAudio: true, hasVideo: true, width: 320, height: 240 });
    expect(probe.durationSeconds).toBeGreaterThanOrEqual(5.9);
    expect(audio.mimeType).toBe("audio/mpeg");
    expect(audio.data.byteLength).toBeGreaterThan(1_000);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].data.byteLength).toBeGreaterThan(100);
  });
});
