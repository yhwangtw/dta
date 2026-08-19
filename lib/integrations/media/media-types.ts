export interface TranscriptSegment {
  startSeconds: number;
  endSeconds?: number;
  text: string;
  speaker?: string;
}

export interface TranscriptResult {
  text: string;
  language?: string;
  durationSeconds?: number;
  segments?: TranscriptSegment[];
}

export interface MediaProbe {
  durationSeconds: number;
  hasAudio: boolean;
  hasVideo: boolean;
  width?: number;
  height?: number;
  audioCodec?: string;
  videoCodec?: string;
}

export interface ExtractedAudio {
  data: Uint8Array;
  fileName: string;
  mimeType: string;
}

export interface VideoKeyframe {
  timestampSeconds: number;
  data: Uint8Array;
  mimeType: "image/jpeg";
}

export interface VisualObservation {
  timestampSeconds: number;
  summary: string;
  visibleText?: string;
  evidence?: string;
}

export interface VisualAnalysisResult {
  observations: VisualObservation[];
  summary?: string;
}
