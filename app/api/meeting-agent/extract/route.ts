import {
  MEETING_SOURCE_MAX_CHARS,
  MEETING_SOURCE_MAX_FILE_BYTES,
  MEETING_MEDIA_MAX_FILE_BYTES,
  MEETING_SOURCE_MAX_FILES,
  MEETING_SOURCE_MAX_TOTAL_BYTES,
  MEETING_MEDIA_EXTENSIONS,
  MEETING_SOURCE_TEXT_EXTENSIONS,
  meetingSourceExtension,
  type MeetingSourceExtractionResult,
} from "@/lib/meeting-source-files";
import { getArtifactStore } from "@/lib/integrations/storage/local-artifact-store";
import { understandMeetingMedia } from "@/lib/agents/meeting/meeting-media-pipeline";

export const runtime = "nodejs";

function cleanFileName(name: string): string {
  return name.replace(/[\r\n\t]/g, " ").trim().slice(0, 255) || "unnamed";
}

async function extractFile(file: File): Promise<MeetingSourceExtractionResult> {
  const name = cleanFileName(file.name);
  const extension = meetingSourceExtension(name);
  const media = MEETING_MEDIA_EXTENSIONS.has(extension);
  const maxBytes = media ? MEETING_MEDIA_MAX_FILE_BYTES : MEETING_SOURCE_MAX_FILE_BYTES;
  if (file.size > maxBytes) {
    return { name, size: file.size, ok: false, error: `File exceeds the ${media ? "100" : "10"} MB limit` };
  }
  if (!MEETING_SOURCE_TEXT_EXTENSIONS.has(extension) && extension !== "docx" && !media) {
    return { name, size: file.size, ok: false, error: "Unsupported meeting source format" };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const artifact = await getArtifactStore().put({
      type: media ? "meeting_media" : "meeting_source",
      title: name,
      mimeType: file.type || "application/octet-stream",
      data: buffer,
      metadata: { originalName: name, extension },
    });
    if (media) {
      const kind = ["mp4", "m4v", "webm", "mov", "ogv"].includes(extension) ? "video" as const : "audio" as const;
      const understanding = await understandMeetingMedia({ artifactId: artifact.id, name, kind });
      const hasEvidence = Boolean(understanding.content?.trim());
      return {
        name,
        size: file.size,
        ok: true,
        kind,
        ...(understanding.content ? { content: understanding.content } : {}),
        chars: understanding.chars,
        artifactId: artifact.id,
        ...(understanding.transcriptArtifactId ? { transcriptArtifactId: understanding.transcriptArtifactId } : {}),
        ...(understanding.audioArtifactId ? { audioArtifactId: understanding.audioArtifactId } : {}),
        ...(understanding.visualAnalysisArtifactId ? { visualAnalysisArtifactId: understanding.visualAnalysisArtifactId } : {}),
        ...(understanding.timelineArtifactId ? { timelineArtifactId: understanding.timelineArtifactId } : {}),
        keyframeArtifactIds: understanding.keyframeArtifactIds,
        ...(understanding.durationSeconds ? { durationSeconds: understanding.durationSeconds } : {}),
        transcriptSegmentCount: understanding.transcriptSegmentCount,
        keyframeCount: understanding.keyframeCount,
        transcriptionStatus: understanding.transcriptionStatus,
        visionStatus: understanding.visionStatus,
        warnings: understanding.warnings,
        ...(!hasEvidence ? { error: understanding.warnings.join(" · ") || "No usable audio or visual evidence was produced" } : {}),
      };
    }
    let content: string;
    let kind: "text" | "docx";
    if (extension === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      content = result.value;
      kind = "docx";
    } else {
      if (buffer.includes(0)) {
        return { name, size: file.size, ok: false, error: "File appears to contain binary data" };
      }
      content = buffer.toString("utf8").replace(/^\uFEFF/, "");
      kind = "text";
    }

    const normalized = content.trim();
    if (!normalized) return { name, size: file.size, ok: false, error: "No readable text found" };
    if (normalized.length > MEETING_SOURCE_MAX_CHARS) {
      return { name, size: file.size, ok: false, error: "Extracted text exceeds 200,000 characters" };
    }
    return { name, size: file.size, ok: true, kind, content: normalized, chars: normalized.length, artifactId: artifact.id, transcriptionStatus: "ready" };
  } catch (error) {
    return {
      name,
      size: file.size,
      ok: false,
      error: error instanceof Error ? `Could not read file: ${error.message}` : "Could not read file",
    };
  }
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return Response.json({ error: "Content-Type must be multipart/form-data" }, { status: 415 });
  }

  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (files.length === 0) return Response.json({ error: "No files supplied" }, { status: 400 });
    if (files.length > MEETING_SOURCE_MAX_FILES) {
      return Response.json({ error: `A maximum of ${MEETING_SOURCE_MAX_FILES} files is allowed` }, { status: 413 });
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MEETING_SOURCE_MAX_TOTAL_BYTES) {
      return Response.json({ error: "Combined upload exceeds the 25 MB limit" }, { status: 413 });
    }

    const results = await Promise.all(files.map(extractFile));
    const totalChars = results.reduce((sum, result) => sum + (result.ok ? result.chars ?? 0 : 0), 0);
    if (totalChars > MEETING_SOURCE_MAX_CHARS) {
      return Response.json({ error: "Combined extracted text exceeds 200,000 characters" }, { status: 413 });
    }
    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
