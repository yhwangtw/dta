"use client";

import { encodeFilePathForApi, getFileName } from "@/lib/file-paths";
import { ImageViewer } from "./ImageViewer";
import { AudioViewer } from "./AudioViewer";
import { DocumentViewer } from "./DocumentViewer";
import { TextFileViewer } from "./TextFileViewer";

interface Props {
  filePath: string;
  cwd?: string;
  /** Jump to this 1-based line on open (from a search hit). */
  gotoLine?: number;
  /** Changes each time a jump is requested, to re-trigger it for an open file. */
  gotoNonce?: number;
}

export interface FileData {
  content: string;
  language: string;
  size: number;
}

export function isImagePath(filePath: string): boolean {
  const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
  const base = getFileName(filePath);
  const ext = base.toLowerCase().split(".").pop() ?? "";
  return IMAGE_EXTS.has(ext);
}

export function isAudioPath(filePath: string): boolean {
  const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "oga", "opus", "m4a", "aac", "flac", "weba", "webm"]);
  const base = getFileName(filePath);
  const ext = base.toLowerCase().split(".").pop() ?? "";
  return AUDIO_EXTS.has(ext);
}

export function getFileExt(filePath: string): string {
  return getFileName(filePath).toLowerCase().split(".").pop() ?? "";
}

function isDocumentPreviewPath(filePath: string): boolean {
  const DOCUMENT_PREVIEW_EXTS = new Set(["pdf", "docx"]);
  return DOCUMENT_PREVIEW_EXTS.has(getFileExt(filePath));
}

export function DownloadLink({ filePath, label = "Download" }: { filePath: string; label?: string }) {
  const encoded = encodeFilePathForApi(filePath);
  return (
    <a
      href={`/api/files/${encoded}?type=read`}
      download={getFileName(filePath)}
      style={{
        color: "var(--text-muted)",
        textDecoration: "none",
        border: "1px solid var(--border)",
        borderRadius: 5,
        padding: "2px 8px",
        fontSize: 11,
        lineHeight: 1.4,
        background: "var(--bg-hover)",
        flexShrink: 0,
      }}
    >
      {label}
    </a>
  );
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
  const totalSeconds = Math.round(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function FileViewer({ filePath, cwd, gotoLine, gotoNonce }: Props) {
  if (isImagePath(filePath)) {
    return <ImageViewer filePath={filePath} cwd={cwd} />;
  }
  if (isAudioPath(filePath)) {
    return <AudioViewer filePath={filePath} cwd={cwd} />;
  }
  if (isDocumentPreviewPath(filePath)) {
    return <DocumentViewer filePath={filePath} cwd={cwd} />;
  }
  return <TextFileViewer filePath={filePath} cwd={cwd} gotoLine={gotoLine} gotoNonce={gotoNonce} />;
}
