import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleTranscriptionProvider } from "../integrations/transcription/transcription-provider";
import type { Artifact } from "../integrations/storage/artifact-store";

const artifact: Artifact = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "meeting_audio",
  title: "meeting.mp3",
  mimeType: "audio/mpeg",
  size: 3,
  createdAt: "2026-08-20T00:00:00.000Z",
  data: new Uint8Array([1, 2, 3]),
  metadata: { originalName: "meeting.mp3" },
};

describe("OpenAICompatibleTranscriptionProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uploads media and normalizes timestamped segments", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      text: "Pilot approved",
      language: "en",
      duration: 12.5,
      segments: [{ start: 1.2, end: 3.4, text: "Pilot approved", speaker: "A" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new OpenAICompatibleTranscriptionProvider("https://gateway.example/v1", "secret", "speech-model", 10_000);
    const result = await provider.transcribe(artifact);
    expect(result).toMatchObject({ text: "Pilot approved", language: "en", durationSeconds: 12.5 });
    expect(result.segments?.[0]).toMatchObject({ startSeconds: 1.2, endSeconds: 3.4, speaker: "A" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://gateway.example/v1/audio/transcriptions");
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("automatically requests diarized JSON for speaker-aware models", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      text: "Pilot approved",
      duration: 5,
      segments: [{ start: 0, end: 5, text: "Pilot approved", speaker: "A" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new OpenAICompatibleTranscriptionProvider("https://gateway.example/v1", undefined, "gpt-4o-transcribe-diarize", 10_000, "auto");
    const result = await provider.transcribe(artifact);
    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(form.get("response_format")).toBe("diarized_json");
    expect(form.get("timestamp_granularities[]")).toBeNull();
    expect(result.segments?.[0].speaker).toBe("A");
  });
});
