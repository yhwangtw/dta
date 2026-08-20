export const MEETING_SOURCE_MAX_FILES = 8;
export const MEETING_SOURCE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MEETING_MEDIA_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MEETING_SOURCE_MAX_TOTAL_BYTES = 150 * 1024 * 1024;
export const MEETING_SOURCE_MAX_CHARS = 200_000;

export const MEETING_SOURCE_TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "srt", "vtt", "log",
]);

export const MEETING_SOURCE_EXTENSIONS = new Set([
  ...MEETING_SOURCE_TEXT_EXTENSIONS,
  "docx",
]);

export const MEETING_MEDIA_EXTENSIONS = new Set([
  "mp3", "wav", "m4a", "aac", "flac", "ogg", "oga", "opus", "weba",
  "mp4", "m4v", "webm", "mov", "ogv",
]);

export const MEETING_SOURCE_ACCEPT = [...MEETING_SOURCE_EXTENSIONS, ...MEETING_MEDIA_EXTENSIONS]
  .map((extension) => `.${extension}`)
  .join(",");

export interface ExtractedMeetingSource {
  name: string;
  size: number;
  kind: "text" | "docx" | "audio" | "video";
  content?: string;
  chars: number;
  artifactId?: string;
  transcriptArtifactId?: string;
  audioArtifactId?: string;
  visualAnalysisArtifactId?: string;
  timelineArtifactId?: string;
  keyframeArtifactIds?: string[];
  durationSeconds?: number;
  transcriptSegmentCount?: number;
  keyframeCount?: number;
  transcriptionStatus?: "ready" | "unavailable" | "failed";
  visionStatus?: "ready" | "unavailable" | "failed" | "not_applicable";
  warnings?: string[];
  error?: string;
}

export interface MeetingSourceExtractionResult {
  name: string;
  size: number;
  ok: boolean;
  kind?: ExtractedMeetingSource["kind"];
  content?: string;
  chars?: number;
  artifactId?: string;
  transcriptArtifactId?: string;
  audioArtifactId?: string;
  visualAnalysisArtifactId?: string;
  timelineArtifactId?: string;
  keyframeArtifactIds?: string[];
  durationSeconds?: number;
  transcriptSegmentCount?: number;
  keyframeCount?: number;
  transcriptionStatus?: "ready" | "unavailable" | "failed";
  visionStatus?: "ready" | "unavailable" | "failed" | "not_applicable";
  warnings?: string[];
  error?: string;
}

export function meetingSourceExtension(name: string): string {
  return name.toLocaleLowerCase().split(".").pop() ?? "";
}

export function formatMeetingSourceBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
