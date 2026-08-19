import { loadDtaConfig, type TranscriptionResponseFormat } from "@/lib/config/env";
import type { Artifact } from "@/lib/integrations/storage/artifact-store";
import type { TranscriptResult, TranscriptSegment } from "@/lib/integrations/media/media-types";

export type { TranscriptResult, TranscriptSegment } from "@/lib/integrations/media/media-types";

export interface TranscriptionProvider {
  readonly name: string;
  readonly available: boolean;
  transcribe(artifact: Artifact): Promise<TranscriptResult>;
}

class UnavailableTranscriptionProvider implements TranscriptionProvider {
  readonly name = "none";
  readonly available = false;
  async transcribe(): Promise<TranscriptResult> {
    throw new Error("Transcription service is not configured");
  }
}

class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock";
  readonly available: boolean;

  constructor(private readonly transcript?: string) {
    this.available = process.env.NODE_ENV !== "production" && Boolean(transcript);
  }

  async transcribe(): Promise<TranscriptResult> {
    if (!this.available || !this.transcript) {
      throw new Error("Mock transcription requires DTA_MOCK_TRANSCRIPT and is disabled in production");
    }
    return { text: this.transcript, segments: [{ startSeconds: 0, text: this.transcript }] };
  }
}

interface CompatibleTranscriptionPayload {
  text?: unknown;
  language?: unknown;
  duration?: unknown;
  segments?: unknown;
}

function normalizeSegments(value: unknown): TranscriptSegment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const segments = value.flatMap((entry): TranscriptSegment[] => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
    const start = Number(candidate.start ?? candidate.start_seconds);
    const end = Number(candidate.end ?? candidate.end_seconds);
    if (!text || !Number.isFinite(start) || start < 0) return [];
    return [{
      startSeconds: start,
      ...(Number.isFinite(end) && end >= start ? { endSeconds: end } : {}),
      text,
      ...(typeof candidate.speaker === "string" && candidate.speaker.trim() ? { speaker: candidate.speaker.trim() } : {}),
    }];
  });
  return segments.length ? segments : undefined;
}

export class OpenAICompatibleTranscriptionProvider implements TranscriptionProvider {
  readonly name = "openai-compatible";
  readonly available: boolean;

  constructor(
    private readonly baseUrl?: string,
    private readonly apiKey?: string,
    private readonly model?: string,
    private readonly timeoutMs = 10 * 60_000,
    private readonly configuredResponseFormat: TranscriptionResponseFormat = "auto",
  ) {
    this.available = Boolean(baseUrl && model);
  }

  async transcribe(artifact: Artifact): Promise<TranscriptResult> {
    if (!this.available || !this.baseUrl || !this.model) throw new Error("Transcription service is not configured");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const form = new FormData();
      const originalName = typeof artifact.metadata?.originalName === "string" ? artifact.metadata.originalName : artifact.title;
      const bytes = new Uint8Array(artifact.data.byteLength);
      bytes.set(artifact.data);
      form.append("file", new Blob([bytes.buffer], { type: artifact.mimeType }), originalName);
      form.append("model", this.model);
      const responseFormat = this.configuredResponseFormat === "auto"
        ? this.model.toLowerCase().includes("diarize")
          ? "diarized_json"
          : this.model.toLowerCase().includes("gpt-4o-transcribe")
            ? "json"
            : "verbose_json"
        : this.configuredResponseFormat;
      form.append("response_format", responseFormat);
      if (responseFormat === "verbose_json") form.append("timestamp_granularities[]", "segment");
      const endpoint = new URL("audio/transcriptions", `${this.baseUrl.replace(/\/+$/, "")}/`).toString();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
        body: form,
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`Transcription request failed (${response.status}): ${raw.slice(0, 500)}`);
      let payload: CompatibleTranscriptionPayload;
      try { payload = JSON.parse(raw) as CompatibleTranscriptionPayload; }
      catch { payload = { text: raw }; }
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) throw new Error("Transcription returned no text");
      const duration = Number(payload.duration);
      return {
        text,
        ...(typeof payload.language === "string" && payload.language.trim() ? { language: payload.language.trim() } : {}),
        ...(Number.isFinite(duration) && duration > 0 ? { durationSeconds: duration } : {}),
        ...(normalizeSegments(payload.segments) ? { segments: normalizeSegments(payload.segments) } : {}),
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("Transcription request timed out");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getTranscriptionProvider(): TranscriptionProvider {
  const config = loadDtaConfig();
  if (config.transcriptionProvider === "mock") return new MockTranscriptionProvider(config.mockTranscript);
  if (config.transcriptionProvider === "openai-compatible") {
    return new OpenAICompatibleTranscriptionProvider(
      config.transcriptionBaseUrl,
      config.transcriptionApiKey,
      config.transcriptionModel,
      config.transcriptionTimeoutMs,
      config.transcriptionResponseFormat,
    );
  }
  return new UnavailableTranscriptionProvider();
}
