import { loadDtaConfig } from "@/lib/config/env";
import type { VideoKeyframe, VisualAnalysisResult, VisualObservation } from "@/lib/integrations/media/media-types";

export interface VisionProvider {
  readonly name: string;
  readonly available: boolean;
  analyze(input: { sourceName: string; frames: VideoKeyframe[] }): Promise<VisualAnalysisResult>;
}

class UnavailableVisionProvider implements VisionProvider {
  readonly name = "none";
  readonly available = false;
  async analyze(): Promise<VisualAnalysisResult> { throw new Error("Vision service is not configured"); }
}

function normalizeObservation(value: unknown, frameTimestamps: number[]): VisualObservation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const summary = typeof candidate.summary === "string" ? candidate.summary.trim() : "";
  const timestamp = Number(candidate.timestampSeconds ?? candidate.timestamp_seconds ?? candidate.timestamp);
  if (!summary || !Number.isFinite(timestamp)) return null;
  const nearest = frameTimestamps.reduce((best, current) => Math.abs(current - timestamp) < Math.abs(best - timestamp) ? current : best, frameTimestamps[0] ?? 0);
  return {
    timestampSeconds: nearest,
    summary,
    ...(typeof candidate.visibleText === "string" && candidate.visibleText.trim() ? { visibleText: candidate.visibleText.trim() } : {}),
    ...(typeof candidate.visible_text === "string" && candidate.visible_text.trim() ? { visibleText: candidate.visible_text.trim() } : {}),
    ...(typeof candidate.evidence === "string" && candidate.evidence.trim() ? { evidence: candidate.evidence.trim() } : {}),
  };
}

export function parseVisualAnalysis(value: unknown, frameTimestamps: number[]): VisualAnalysisResult {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const observations = Array.isArray(candidate.observations)
    ? candidate.observations.map((entry) => normalizeObservation(entry, frameTimestamps)).filter((entry): entry is VisualObservation => Boolean(entry))
    : [];
  return {
    observations,
    ...(typeof candidate.summary === "string" && candidate.summary.trim() ? { summary: candidate.summary.trim() } : {}),
  };
}

class MockVisionProvider implements VisionProvider {
  readonly name = "mock";
  readonly available: boolean;

  constructor(private readonly result?: string) {
    this.available = process.env.NODE_ENV !== "production" && Boolean(result);
  }

  async analyze(input: { frames: VideoKeyframe[] }): Promise<VisualAnalysisResult> {
    if (!this.available || !this.result) throw new Error("Mock vision requires DTA_MOCK_VISION_RESULT and is disabled in production");
    return parseVisualAnalysis(JSON.parse(this.result), input.frames.map((frame) => frame.timestampSeconds));
  }
}

interface CompatibleChatResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  output_text?: unknown;
}

function contentText(payload: CompatibleChatResponse): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.flatMap((item) => item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string" ? [(item as { text: string }).text] : []).join("\n");
  }
  return "";
}

export class OpenAICompatibleVisionProvider implements VisionProvider {
  readonly name = "openai-compatible";
  readonly available: boolean;

  constructor(
    private readonly baseUrl?: string,
    private readonly apiKey?: string,
    private readonly model?: string,
    private readonly timeoutMs = 5 * 60_000,
  ) {
    this.available = Boolean(baseUrl && model);
  }

  async analyze(input: { sourceName: string; frames: VideoKeyframe[] }): Promise<VisualAnalysisResult> {
    if (!this.available || !this.baseUrl || !this.model) throw new Error("Vision service is not configured");
    if (!input.frames.length) return { observations: [] };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const frameList = input.frames.map((frame, index) => `Frame ${index + 1}: ${frame.timestampSeconds.toFixed(1)} seconds`).join("\n");
      const prompt = `Analyze sampled keyframes from a business meeting video named ${JSON.stringify(input.sourceName)}.
Identify only evidence visible in the frames: slide titles, decisions shown on screen, metrics, diagrams, product demos, whiteboard content, and meaningful changes. Never infer speech or off-screen events.

Frame timestamps:
${frameList}

Return JSON only with this shape:
{"summary":"overall visual context","observations":[{"timestampSeconds":0,"summary":"what is visibly happening","visibleText":"important readable text","evidence":"why this matters to the meeting"}]}`;
      const content = [
        { type: "text", text: prompt },
        ...input.frames.map((frame) => ({
          type: "image_url",
          image_url: { url: `data:${frame.mimeType};base64,${Buffer.from(frame.data).toString("base64")}`, detail: "low" },
        })),
      ];
      const endpoint = new URL("chat/completions", `${this.baseUrl.replace(/\/+$/, "")}/`).toString();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: this.model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`Vision request failed (${response.status}): ${raw.slice(0, 500)}`);
      const payload = JSON.parse(raw) as CompatibleChatResponse;
      const text = contentText(payload).trim();
      if (!text) throw new Error("Vision service returned no analysis");
      const json = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      return parseVisualAnalysis(JSON.parse(json), input.frames.map((frame) => frame.timestampSeconds));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("Vision request timed out");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getVisionProvider(): VisionProvider {
  const config = loadDtaConfig();
  if (config.visionProvider === "mock") return new MockVisionProvider(config.mockVisionResult);
  if (config.visionProvider === "openai-compatible") {
    return new OpenAICompatibleVisionProvider(config.visionBaseUrl, config.visionApiKey, config.visionModel, config.visionTimeoutMs);
  }
  return new UnavailableVisionProvider();
}
