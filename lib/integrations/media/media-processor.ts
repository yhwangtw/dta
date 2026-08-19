import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { loadDtaConfig } from "@/lib/config/env";
import type { Artifact } from "@/lib/integrations/storage/artifact-store";
import type { ExtractedAudio, MediaProbe, VideoKeyframe } from "./media-types";

const execFileAsync = promisify(execFile);

function safeExtension(artifact: Artifact): string {
  const original = typeof artifact.metadata?.originalName === "string" ? artifact.metadata.originalName : artifact.title;
  const extension = extname(original).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".bin";
}

async function withMediaFile<T>(artifact: Artifact, work: (inputPath: string, directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "dta-media-"));
  const inputPath = join(directory, `input${safeExtension(artifact)}`);
  try {
    await writeFile(inputPath, artifact.data, { mode: 0o600 });
    return await work(inputPath, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

interface FfprobeOutput {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: "audio" | "video";
    codec_name?: string;
    width?: number;
    height?: number;
  }>;
}

export interface MediaProcessor {
  readonly name: string;
  readonly available: boolean;
  probe(artifact: Artifact): Promise<MediaProbe>;
  extractAudio(artifact: Artifact): Promise<ExtractedAudio>;
  extractKeyframes(artifact: Artifact, probe: MediaProbe): Promise<VideoKeyframe[]>;
}

class UnavailableMediaProcessor implements MediaProcessor {
  readonly name = "none";
  readonly available = false;
  async probe(): Promise<MediaProbe> { throw new Error("Media processing is not configured"); }
  async extractAudio(): Promise<ExtractedAudio> { throw new Error("Media processing is not configured"); }
  async extractKeyframes(): Promise<VideoKeyframe[]> { throw new Error("Media processing is not configured"); }
}

export class FfmpegMediaProcessor implements MediaProcessor {
  readonly name = "ffmpeg";
  readonly available = true;

  async probe(artifact: Artifact): Promise<MediaProbe> {
    const config = loadDtaConfig();
    return withMediaFile(artifact, async (inputPath) => {
      const { stdout } = await execFileAsync(config.ffprobePath, [
        "-v", "error",
        "-show_entries", "format=duration:stream=codec_type,codec_name,width,height",
        "-of", "json",
        inputPath,
      ], { timeout: config.mediaProcessTimeoutMs, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" });
      const parsed = JSON.parse(stdout) as FfprobeOutput;
      const durationSeconds = Number(parsed.format?.duration);
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Media duration could not be determined");
      if (durationSeconds > config.mediaMaxDurationSeconds) {
        throw new Error(`Media duration exceeds the ${Math.floor(config.mediaMaxDurationSeconds / 60)} minute limit`);
      }
      const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
      const video = parsed.streams?.find((stream) => stream.codec_type === "video");
      return {
        durationSeconds,
        hasAudio: Boolean(audio),
        hasVideo: Boolean(video),
        ...(video?.width ? { width: video.width } : {}),
        ...(video?.height ? { height: video.height } : {}),
        ...(audio?.codec_name ? { audioCodec: audio.codec_name } : {}),
        ...(video?.codec_name ? { videoCodec: video.codec_name } : {}),
      };
    });
  }

  async extractAudio(artifact: Artifact): Promise<ExtractedAudio> {
    const config = loadDtaConfig();
    return withMediaFile(artifact, async (inputPath, directory) => {
      const outputPath = join(directory, "meeting-audio.mp3");
      await execFileAsync(config.ffmpegPath, [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", inputPath,
        "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k",
        outputPath,
      ], { timeout: config.mediaProcessTimeoutMs, maxBuffer: 4 * 1024 * 1024 });
      return { data: await readFile(outputPath), fileName: "meeting-audio.mp3", mimeType: "audio/mpeg" };
    });
  }

  async extractKeyframes(artifact: Artifact, probe: MediaProbe): Promise<VideoKeyframe[]> {
    if (!probe.hasVideo) return [];
    const config = loadDtaConfig();
    return withMediaFile(artifact, async (inputPath, directory) => {
      const frameDirectory = join(directory, "frames");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(frameDirectory, { mode: 0o700 });
      const intervalSeconds = Math.max(5, probe.durationSeconds / config.videoMaxKeyframes);
      const outputPattern = join(frameDirectory, "frame-%03d.jpg");
      await execFileAsync(config.ffmpegPath, [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", inputPath,
        "-vf", `fps=1/${intervalSeconds},scale='min(iw,${config.videoFrameWidth})':-2`,
        "-frames:v", String(config.videoMaxKeyframes),
        "-q:v", "3",
        outputPattern,
      ], { timeout: config.mediaProcessTimeoutMs, maxBuffer: 4 * 1024 * 1024 });
      const names = (await readdir(frameDirectory)).filter((name) => /^frame-\d+\.jpg$/.test(name)).sort();
      return Promise.all(names.map(async (name, index) => ({
        timestampSeconds: Math.min(probe.durationSeconds, index * intervalSeconds),
        data: await readFile(join(frameDirectory, name)),
        mimeType: "image/jpeg" as const,
      })));
    });
  }
}

export function getMediaProcessor(): MediaProcessor {
  return loadDtaConfig().mediaProcessor === "ffmpeg" ? new FfmpegMediaProcessor() : new UnavailableMediaProcessor();
}
