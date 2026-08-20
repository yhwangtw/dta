import type { TranscriptResult, VisualAnalysisResult } from "./media-types";

export function formatMediaTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function buildMeetingMediaTimeline(input: {
  sourceName: string;
  transcript?: TranscriptResult;
  visual?: VisualAnalysisResult;
}): string {
  const lines = [`# Media evidence: ${input.sourceName}`];
  if (input.transcript) {
    lines.push("", "## Transcript");
    if (input.transcript.language) lines.push(`Language: ${input.transcript.language}`);
    if (input.transcript.segments?.length) {
      for (const segment of input.transcript.segments) {
        const end = segment.endSeconds === undefined ? "" : `–${formatMediaTimestamp(segment.endSeconds)}`;
        const speaker = segment.speaker ? `${segment.speaker}: ` : "";
        lines.push(`[${formatMediaTimestamp(segment.startSeconds)}${end}] ${speaker}${segment.text.trim()}`);
      }
    } else {
      lines.push(input.transcript.text.trim());
    }
  }
  if (input.visual?.observations.length) {
    lines.push("", "## Visual evidence");
    if (input.visual.summary) lines.push(input.visual.summary.trim(), "");
    for (const observation of input.visual.observations) {
      const details = [observation.summary.trim(), observation.visibleText?.trim() && `Visible text: ${observation.visibleText.trim()}`, observation.evidence?.trim() && `Evidence: ${observation.evidence.trim()}`].filter(Boolean);
      lines.push(`[${formatMediaTimestamp(observation.timestampSeconds)}] ${details.join(" · ")}`);
    }
  }
  return lines.join("\n").trim();
}
