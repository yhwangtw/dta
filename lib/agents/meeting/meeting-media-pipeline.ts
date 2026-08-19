import type { ArtifactReference, ArtifactStore } from "@/lib/integrations/storage/artifact-store";
import { getArtifactStore } from "@/lib/integrations/storage/local-artifact-store";
import { getMediaProcessor, type MediaProcessor } from "@/lib/integrations/media/media-processor";
import { buildMeetingMediaTimeline } from "@/lib/integrations/media/meeting-timeline";
import type { MediaProbe, TranscriptResult, VisualAnalysisResult } from "@/lib/integrations/media/media-types";
import { getTranscriptionProvider, type TranscriptionProvider } from "@/lib/integrations/transcription/transcription-provider";
import { getVisionProvider, type VisionProvider } from "@/lib/integrations/vision/vision-provider";

export interface MeetingMediaUnderstanding {
  content?: string;
  chars: number;
  durationSeconds?: number;
  transcriptArtifactId?: string;
  audioArtifactId?: string;
  keyframeArtifactIds: string[];
  visualAnalysisArtifactId?: string;
  timelineArtifactId?: string;
  transcriptSegmentCount: number;
  keyframeCount: number;
  transcriptionStatus: "ready" | "unavailable" | "failed";
  visionStatus: "ready" | "unavailable" | "failed" | "not_applicable";
  warnings: string[];
}

interface Dependencies {
  store?: ArtifactStore;
  mediaProcessor?: MediaProcessor;
  transcriptionProvider?: TranscriptionProvider;
  visionProvider?: VisionProvider;
}

async function storeTranscript(store: ArtifactStore, name: string, sourceArtifactId: string, provider: TranscriptionProvider, transcript: TranscriptResult): Promise<ArtifactReference> {
  return store.put({
    type: "transcript",
    title: `${name} — transcript`,
    mimeType: "application/json; charset=utf-8",
    data: JSON.stringify(transcript, null, 2),
    metadata: { sourceArtifactId, provider: provider.name, segmentCount: transcript.segments?.length ?? 0, language: transcript.language },
  });
}

export async function understandMeetingMedia(input: {
  artifactId: string;
  name: string;
  kind: "audio" | "video";
}, dependencies: Dependencies = {}): Promise<MeetingMediaUnderstanding> {
  const store = dependencies.store ?? getArtifactStore();
  const processor = dependencies.mediaProcessor ?? getMediaProcessor();
  const transcriptionProvider = dependencies.transcriptionProvider ?? getTranscriptionProvider();
  const visionProvider = dependencies.visionProvider ?? getVisionProvider();
  const artifact = await store.get(input.artifactId);
  const warnings: string[] = [];
  let probe: MediaProbe | undefined;
  let transcript: TranscriptResult | undefined;
  let visual: VisualAnalysisResult | undefined;
  let transcriptArtifactId: string | undefined;
  let audioArtifactId: string | undefined;
  let visualAnalysisArtifactId: string | undefined;
  let timelineArtifactId: string | undefined;
  const keyframeArtifactIds: string[] = [];
  let transcriptionStatus: MeetingMediaUnderstanding["transcriptionStatus"] = transcriptionProvider.available ? "failed" : "unavailable";
  let visionStatus: MeetingMediaUnderstanding["visionStatus"] = input.kind === "audio" ? "not_applicable" : visionProvider.available ? "failed" : "unavailable";

  if (processor.available) {
    try { probe = await processor.probe(artifact); }
    catch (error) { warnings.push(error instanceof Error ? error.message : String(error)); }
  } else if (input.kind === "video") {
    warnings.push("FFmpeg media processing is not configured");
  }

  if (transcriptionProvider.available) {
    try {
      let transcriptionArtifact = artifact;
      if (input.kind === "video") {
        if (!processor.available || (probe && !probe.hasAudio)) throw new Error(probe && !probe.hasAudio ? "Video contains no audio stream" : "FFmpeg is required to extract video audio");
        const extracted = await processor.extractAudio(artifact);
        const audioReference = await store.put({
          type: "meeting_audio",
          title: `${input.name} — extracted audio`,
          mimeType: extracted.mimeType,
          data: extracted.data,
          metadata: { sourceArtifactId: artifact.id, originalName: extracted.fileName, processor: processor.name },
        });
        audioArtifactId = audioReference.id;
        transcriptionArtifact = await store.get(audioReference.id);
      }
      transcript = await transcriptionProvider.transcribe(transcriptionArtifact);
      transcript.text = transcript.text.trim();
      if (!transcript.text) throw new Error("Transcription returned no text");
      const transcriptReference = await storeTranscript(store, input.name, artifact.id, transcriptionProvider, transcript);
      transcriptArtifactId = transcriptReference.id;
      transcriptionStatus = "ready";
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      transcriptionStatus = "failed";
    }
  } else {
    warnings.push("Transcription service is not configured");
  }

  if (input.kind === "video" && visionProvider.available) {
    try {
      if (!processor.available) throw new Error("FFmpeg is required to sample video keyframes");
      if (probe && !probe.hasVideo) throw new Error("Media contains no video stream");
      probe ??= await processor.probe(artifact);
      const frames = await processor.extractKeyframes(artifact, probe);
      if (!frames.length) throw new Error("No video keyframes could be extracted");
      for (const [index, frame] of frames.entries()) {
        const reference = await store.put({
          type: "meeting_keyframe",
          title: `${input.name} — keyframe ${index + 1}`,
          mimeType: frame.mimeType,
          data: frame.data,
          metadata: { sourceArtifactId: artifact.id, timestampSeconds: frame.timestampSeconds, processor: processor.name },
        });
        keyframeArtifactIds.push(reference.id);
      }
      visual = await visionProvider.analyze({ sourceName: input.name, frames });
      const visualReference = await store.put({
        type: "visual_analysis",
        title: `${input.name} — visual analysis`,
        mimeType: "application/json; charset=utf-8",
        data: JSON.stringify(visual, null, 2),
        metadata: { sourceArtifactId: artifact.id, provider: visionProvider.name, keyframeArtifactIds },
      });
      visualAnalysisArtifactId = visualReference.id;
      visionStatus = "ready";
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      visionStatus = "failed";
    }
  } else if (input.kind === "video") {
    warnings.push("Vision service is not configured");
  }

  const hasEvidence = Boolean(transcript?.text || visual?.observations.length);
  const content = hasEvidence ? buildMeetingMediaTimeline({ sourceName: input.name, transcript, visual }) : undefined;
  if (content) {
    const timelineReference = await store.put({
      type: "meeting_timeline",
      title: `${input.name} — synchronized evidence timeline`,
      mimeType: "text/markdown; charset=utf-8",
      data: content,
      metadata: {
        sourceArtifactId: artifact.id,
        transcriptArtifactId,
        visualAnalysisArtifactId,
        keyframeArtifactIds,
        durationSeconds: probe?.durationSeconds ?? transcript?.durationSeconds,
      },
    });
    timelineArtifactId = timelineReference.id;
  }

  return {
    ...(content ? { content } : {}),
    chars: content?.length ?? 0,
    ...(probe?.durationSeconds || transcript?.durationSeconds ? { durationSeconds: probe?.durationSeconds ?? transcript?.durationSeconds } : {}),
    ...(transcriptArtifactId ? { transcriptArtifactId } : {}),
    ...(audioArtifactId ? { audioArtifactId } : {}),
    keyframeArtifactIds,
    ...(visualAnalysisArtifactId ? { visualAnalysisArtifactId } : {}),
    ...(timelineArtifactId ? { timelineArtifactId } : {}),
    transcriptSegmentCount: transcript?.segments?.length ?? 0,
    keyframeCount: keyframeArtifactIds.length,
    transcriptionStatus,
    visionStatus,
    warnings: [...new Set(warnings)],
  };
}
