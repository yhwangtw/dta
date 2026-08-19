import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AgentType } from "@/lib/agents/agent-types";

export type TranscriptionProviderName = "none" | "mock" | "openai-compatible";
export type TranscriptionResponseFormat = "auto" | "json" | "verbose_json" | "diarized_json";
export type VisionProviderName = "none" | "mock" | "openai-compatible";
export type MediaProcessorName = "none" | "ffmpeg";

export interface DtaConfig {
  dataDir: string;
  defaultAgentType: AgentType;
  transcriptionProvider: TranscriptionProviderName;
  mockTranscript?: string;
  transcriptionBaseUrl?: string;
  transcriptionApiKey?: string;
  transcriptionModel?: string;
  transcriptionResponseFormat: TranscriptionResponseFormat;
  transcriptionTimeoutMs: number;
  visionProvider: VisionProviderName;
  mockVisionResult?: string;
  visionBaseUrl?: string;
  visionApiKey?: string;
  visionModel?: string;
  visionTimeoutMs: number;
  mediaProcessor: MediaProcessorName;
  ffmpegPath: string;
  ffprobePath: string;
  mediaMaxDurationSeconds: number;
  videoMaxKeyframes: number;
  videoFrameWidth: number;
  mediaProcessTimeoutMs: number;
}

function enumValue<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function loadDtaConfig(env: NodeJS.ProcessEnv = process.env): DtaConfig {
  const configuredDir = env.DTA_DATA_DIR?.trim();
  const defaultDataDir = env.NODE_ENV === "test"
    ? join(tmpdir(), `dta-test-${process.pid}`)
    : join(homedir(), ".dta");
  return {
    dataDir: resolve(configuredDir || defaultDataDir),
    defaultAgentType: enumValue(env.AGENT_DEFAULT_TYPE, ["coding", "meeting", "pm"] as const, "meeting"),
    transcriptionProvider: enumValue(env.DTA_TRANSCRIPTION_PROVIDER, ["none", "mock", "openai-compatible"] as const, "none"),
    ...(env.DTA_MOCK_TRANSCRIPT?.trim() ? { mockTranscript: env.DTA_MOCK_TRANSCRIPT.trim() } : {}),
    ...(optional(env.DTA_TRANSCRIPTION_BASE_URL ?? env.LLM_BASE_URL) ? { transcriptionBaseUrl: optional(env.DTA_TRANSCRIPTION_BASE_URL ?? env.LLM_BASE_URL) } : {}),
    ...(optional(env.DTA_TRANSCRIPTION_API_KEY ?? env.LLM_API_KEY) ? { transcriptionApiKey: optional(env.DTA_TRANSCRIPTION_API_KEY ?? env.LLM_API_KEY) } : {}),
    ...(optional(env.DTA_TRANSCRIPTION_MODEL) ? { transcriptionModel: optional(env.DTA_TRANSCRIPTION_MODEL) } : {}),
    transcriptionResponseFormat: enumValue(env.DTA_TRANSCRIPTION_RESPONSE_FORMAT, ["auto", "json", "verbose_json", "diarized_json"] as const, "auto"),
    transcriptionTimeoutMs: boundedInteger(env.DTA_TRANSCRIPTION_TIMEOUT_MS, 10 * 60_000, 10_000, 30 * 60_000),
    visionProvider: enumValue(env.DTA_VISION_PROVIDER, ["none", "mock", "openai-compatible"] as const, "none"),
    ...(optional(env.DTA_MOCK_VISION_RESULT) ? { mockVisionResult: optional(env.DTA_MOCK_VISION_RESULT) } : {}),
    ...(optional(env.DTA_VISION_BASE_URL ?? env.LLM_BASE_URL) ? { visionBaseUrl: optional(env.DTA_VISION_BASE_URL ?? env.LLM_BASE_URL) } : {}),
    ...(optional(env.DTA_VISION_API_KEY ?? env.LLM_API_KEY) ? { visionApiKey: optional(env.DTA_VISION_API_KEY ?? env.LLM_API_KEY) } : {}),
    ...(optional(env.DTA_VISION_MODEL ?? env.LLM_MODEL) ? { visionModel: optional(env.DTA_VISION_MODEL ?? env.LLM_MODEL) } : {}),
    visionTimeoutMs: boundedInteger(env.DTA_VISION_TIMEOUT_MS, 5 * 60_000, 10_000, 15 * 60_000),
    mediaProcessor: enumValue(env.DTA_MEDIA_PROCESSOR, ["none", "ffmpeg"] as const, "ffmpeg"),
    ffmpegPath: optional(env.DTA_FFMPEG_PATH) ?? "ffmpeg",
    ffprobePath: optional(env.DTA_FFPROBE_PATH) ?? "ffprobe",
    mediaMaxDurationSeconds: boundedInteger(env.DTA_MEDIA_MAX_DURATION_SECONDS, 4 * 60 * 60, 60, 12 * 60 * 60),
    videoMaxKeyframes: boundedInteger(env.DTA_VIDEO_MAX_KEYFRAMES, 12, 1, 48),
    videoFrameWidth: boundedInteger(env.DTA_VIDEO_FRAME_WIDTH, 1280, 320, 1920),
    mediaProcessTimeoutMs: boundedInteger(env.DTA_MEDIA_PROCESS_TIMEOUT_MS, 5 * 60_000, 10_000, 30 * 60_000),
  };
}

export function getDtaDataDir(): string {
  return loadDtaConfig().dataDir;
}

export function dtaCapabilityWarnings(config = loadDtaConfig()): string[] {
  const warnings: string[] = [];
  if (config.transcriptionProvider === "none") {
    warnings.push("Meeting audio/video transcription is unavailable until DTA_TRANSCRIPTION_PROVIDER is configured");
  }
  if (config.transcriptionProvider === "mock" && (!config.mockTranscript || process.env.NODE_ENV === "production")) {
    warnings.push("Mock transcription requires DTA_MOCK_TRANSCRIPT and is never enabled in production");
  }
  if (config.transcriptionProvider === "openai-compatible" && (!config.transcriptionBaseUrl || !config.transcriptionModel)) {
    warnings.push("OpenAI-compatible transcription requires DTA_TRANSCRIPTION_BASE_URL and DTA_TRANSCRIPTION_MODEL");
  }
  if (config.visionProvider === "none") {
    warnings.push("Meeting video visual analysis is unavailable until DTA_VISION_PROVIDER is configured");
  }
  if (config.visionProvider === "mock" && (!config.mockVisionResult || process.env.NODE_ENV === "production")) {
    warnings.push("Mock vision requires DTA_MOCK_VISION_RESULT and is never enabled in production");
  }
  if (config.visionProvider === "openai-compatible" && (!config.visionBaseUrl || !config.visionModel)) {
    warnings.push("OpenAI-compatible vision requires DTA_VISION_BASE_URL and DTA_VISION_MODEL");
  }
  if (config.mediaProcessor === "none") {
    warnings.push("Video audio extraction and keyframe sampling are disabled because DTA_MEDIA_PROCESSOR=none");
  }
  return warnings;
}
