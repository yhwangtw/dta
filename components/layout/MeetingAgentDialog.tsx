"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { buildMeetingMinutesPrompt, type MeetingOutputLanguage } from "@/lib/meeting-agent";
import { appendMeetingDictation } from "@/lib/meeting-dictation";
import {
  MEETING_SOURCE_ACCEPT,
  MEETING_SOURCE_MAX_CHARS,
  MEETING_SOURCE_MAX_FILES,
  formatMeetingSourceBytes,
  type ExtractedMeetingSource,
  type MeetingSourceExtractionResult,
} from "@/lib/meeting-source-files";
import s from "./MeetingAgentDialog.module.css";

interface Props {
  onClose: () => void;
  onLaunch: (input: { prompt: string; runId: string; cwd: string }) => void;
  managedWorkspaceCwd?: string;
}

interface ManagedWorkspaceResponse {
  workspace?: { id: string; displayName: string; cwd: string };
  error?: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionResultEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function formatDuration(seconds: number | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function MeetingAgentDialog({ onClose, onLaunch, managedWorkspaceCwd }: Props) {
  const { locale, t } = useI18n();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [participants, setParticipants] = useState("");
  const [objective, setObjective] = useState("");
  const [source, setSource] = useState("");
  const [outputLanguage, setOutputLanguage] = useState<MeetingOutputLanguage>(locale === "zh" ? "zh-TW" : "en");
  const [attachments, setAttachments] = useState<ExtractedMeetingSource[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [dictationSupported, setDictationSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [dictationError, setDictationError] = useState("");
  const [workspace, setWorkspace] = useState<{ displayName: string; cwd: string } | null>(
    managedWorkspaceCwd ? { displayName: "DTA Meeting Space", cwd: managedWorkspaceCwd } : null,
  );
  const [workspaceError, setWorkspaceError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const extractedChars = attachments.reduce((sum, attachment) => sum + attachment.chars, 0);
  const totalSourceChars = source.trim().length + extractedChars;
  const sourceLimitExceeded = totalSourceChars > MEETING_SOURCE_MAX_CHARS;
  const mediaEvidenceBlocked = attachments.some((attachment) => (attachment.kind === "audio" || attachment.kind === "video") && !attachment.content?.trim());
  const canLaunch = Boolean(workspace)
    && Boolean(source.trim() || attachments.some((attachment) => attachment.content?.trim()))
    && !uploading
    && !sourceLimitExceeded
    && !mediaEvidenceBlocked;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setDictationSupported(Boolean(getSpeechRecognitionConstructor() && window.isSecureContext));
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (managedWorkspaceCwd || workspace) return;
    const controller = new AbortController();
    fetch("/api/meeting-agent/workspace", { method: "POST", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as ManagedWorkspaceResponse;
        if (!response.ok || !payload.workspace) throw new Error(payload.error || `HTTP ${response.status}`);
        setWorkspace({ displayName: payload.workspace.displayName, cwd: payload.workspace.cwd });
        setWorkspaceError("");
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setWorkspaceError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => controller.abort();
  }, [managedWorkspaceCwd, workspace]);

  const dictationErrorMessage = (error: string): string => {
    if (error === "not-allowed" || error === "service-not-allowed") return t("meetingAgent.micDenied");
    if (error === "audio-capture") return t("meetingAgent.micMissing");
    if (error === "no-speech") return t("meetingAgent.noSpeech");
    return t("meetingAgent.micError");
  };

  const toggleDictation = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition || !window.isSecureContext) {
      setDictationError(t("meetingAgent.micUnsupported"));
      return;
    }

    const recognition = recognitionRef.current ?? new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = outputLanguage === "zh-TW" ? "zh-TW" : "en-US";
    recognition.onstart = () => {
      setListening(true);
      setDictationError("");
      setInterimTranscript("");
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText.trim()) {
        setSource((current) => {
          const appended = appendMeetingDictation(current, finalText, MEETING_SOURCE_MAX_CHARS - extractedChars);
          if (!appended.accepted) setDictationError(t("meetingAgent.sourceTooLong"));
          return appended.text;
        });
      }
      setInterimTranscript(interimText.trim());
    };
    recognition.onerror = (event) => {
      setDictationError(dictationErrorMessage(event.error));
      setListening(false);
      setInterimTranscript("");
    };
    recognition.onend = () => {
      setListening(false);
      setInterimTranscript("");
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setDictationError(t("meetingAgent.micError"));
      setListening(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!workspace || (!source.trim() && attachments.length === 0) || uploading) return;
    const runId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    onLaunch({ prompt: buildMeetingMinutesPrompt({
      title,
      date,
      participants,
      objective,
      source,
      attachments: attachments.map(({ name, content, artifactId, transcriptArtifactId, visualAnalysisArtifactId, timelineArtifactId }) => ({ name, content, artifactId, transcriptArtifactId, visualAnalysisArtifactId, timelineArtifactId })),
      outputLanguage,
    }), runId, cwd: workspace.cwd });
  };

  const processFiles = async (input: File[]) => {
    if (uploading || input.length === 0) return;
    const unique = input.filter((file) => !attachments.some((existing) => existing.name === file.name && existing.size === file.size));
    if (unique.length === 0) {
      setUploadError(t("meetingAgent.duplicateFiles"));
      return;
    }
    if (attachments.length + unique.length > MEETING_SOURCE_MAX_FILES) {
      setUploadError(t("meetingAgent.tooManyFiles"));
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      for (const file of unique) form.append("files", file);
      const response = await fetch("/api/meeting-agent/extract", { method: "POST", body: form });
      const payload = await response.json() as { results?: MeetingSourceExtractionResult[]; error?: string };
      if (!response.ok || !payload.results) throw new Error(payload.error || `HTTP ${response.status}`);

      const accepted: ExtractedMeetingSource[] = [];
      const errors: string[] = [];
      let nextChars = totalSourceChars;
      for (const result of payload.results) {
        if (!result.ok || !result.kind || typeof result.chars !== "number") {
          errors.push(`${result.name}: ${result.error ?? t("meetingAgent.readFailed")}`);
          continue;
        }
        if (nextChars + result.chars > MEETING_SOURCE_MAX_CHARS) {
          errors.push(`${result.name}: ${t("meetingAgent.sourceTooLong")}`);
          continue;
        }
        accepted.push({
          name: result.name,
          size: result.size,
          kind: result.kind,
          content: result.content,
          chars: result.chars,
          artifactId: result.artifactId,
          transcriptArtifactId: result.transcriptArtifactId,
          audioArtifactId: result.audioArtifactId,
          visualAnalysisArtifactId: result.visualAnalysisArtifactId,
          timelineArtifactId: result.timelineArtifactId,
          keyframeArtifactIds: result.keyframeArtifactIds,
          durationSeconds: result.durationSeconds,
          transcriptSegmentCount: result.transcriptSegmentCount,
          keyframeCount: result.keyframeCount,
          transcriptionStatus: result.transcriptionStatus,
          visionStatus: result.visionStatus,
          warnings: result.warnings,
          error: result.error,
        });
        nextChars += result.chars;
      }
      if (accepted.length > 0) setAttachments((current) => [...current, ...accepted]);
      if (errors.length > 0) setUploadError(errors.join(" · "));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("meetingAgent.readFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    void processFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className={s.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="meeting-agent-title" data-testid="meeting-agent-dialog">
        <header className={s.header}>
          <div className={s.headingGroup}>
            <span className={s.badge}>DTA · MEETING INTELLIGENCE</span>
            <h2 id="meeting-agent-title">{t("meetingAgent.title")}</h2>
            <p>{t("meetingAgent.description")}</p>
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label={t("common.close")}>×</button>
        </header>

        <form className={s.form} onSubmit={submit}>
          <div className={s.workspace}>
            <div>
              <span>{t("meetingAgent.workspace")}</span>
              <strong>{workspace?.displayName ?? t("meetingAgent.preparingWorkspace")}</strong>
              <small>{workspace ? t("meetingAgent.managedWorkspace") : workspaceError || t("meetingAgent.preparingWorkspaceHint")}</small>
            </div>
          </div>

          <div className={s.twoColumns}>
            <label className={s.field}>
              <span>{t("meetingAgent.meetingTitle")}</span>
              <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder={t("meetingAgent.meetingTitlePlaceholder")} />
            </label>
            <label className={s.field}>
              <span>{t("meetingAgent.date")}</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>

          <label className={s.field}>
            <span>{t("meetingAgent.participants")}</span>
            <input value={participants} onChange={(event) => setParticipants(event.target.value)} maxLength={1000} placeholder={t("meetingAgent.participantsPlaceholder")} />
          </label>

          <label className={s.field}>
            <span>{t("meetingAgent.objective")}</span>
            <input value={objective} onChange={(event) => setObjective(event.target.value)} maxLength={1000} placeholder={t("meetingAgent.objectivePlaceholder")} />
          </label>

          <div className={s.field}>
            <div className={s.sourceHeader}>
              <label htmlFor="meeting-agent-source">{t("meetingAgent.source")}</label>
              <button
                type="button"
                className={`${s.micButton} ${listening ? s.micButtonActive : ""}`}
                onClick={toggleDictation}
                disabled={dictationSupported !== true}
                aria-pressed={listening}
                aria-label={listening ? t("meetingAgent.stopDictation") : t("meetingAgent.startDictation")}
                title={dictationSupported === false ? t("meetingAgent.micUnsupported") : undefined}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
                </svg>
                <span>{listening ? t("meetingAgent.stopDictation") : t("meetingAgent.startDictation")}</span>
                {listening && <i aria-hidden />}
              </button>
            </div>
            <textarea
              id="meeting-agent-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              maxLength={200_000}
              placeholder={t("meetingAgent.sourcePlaceholder")}
            />
            <small>{t("meetingAgent.sourceHint")}</small>
            {dictationSupported === false && <small>{t("meetingAgent.micUnsupported")}</small>}
            {(listening || interimTranscript) && (
              <div className={s.dictationStatus} role="status" aria-live="polite">
                <span>{t("meetingAgent.listening")}</span>
                {interimTranscript && <q>{interimTranscript}</q>}
              </div>
            )}
            {dictationError && <div className={s.uploadError} role="alert">{dictationError}</div>}
            <small>{t("meetingAgent.micPrivacy")}</small>
          </div>

          <section className={s.uploadSection} aria-labelledby="meeting-agent-files-label">
            <div className={s.uploadHeading}>
              <div>
                <span id="meeting-agent-files-label">{t("meetingAgent.files")}</span>
                <small>{t("meetingAgent.filesHint")}</small>
              </div>
              <span>{attachments.length}/{MEETING_SOURCE_MAX_FILES}</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept={MEETING_SOURCE_ACCEPT}
              onChange={(event) => void processFiles(Array.from(event.target.files ?? []))}
            />
            <button
              type="button"
              className={`${s.dropzone} ${dragging ? s.dropzoneDragging : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              disabled={uploading || attachments.length >= MEETING_SOURCE_MAX_FILES}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 14v5h14v-5" />
              </svg>
              <span>{uploading ? t("meetingAgent.analyzingMedia") : t("meetingAgent.addFiles")}</span>
            </button>

            {attachments.length > 0 && (
              <ul className={s.fileList} aria-label={t("meetingAgent.attachedFiles")}>
                {attachments.map((attachment) => (
                  <li key={`${attachment.name}:${attachment.size}`}>
                    <span className={s.fileType}>{attachment.kind === "docx" ? "DOCX" : attachment.kind.toUpperCase()}</span>
                    <span className={s.fileMeta}>
                      <strong>{attachment.name}</strong>
                      <small>{[formatMeetingSourceBytes(attachment.size), formatDuration(attachment.durationSeconds), `${attachment.chars.toLocaleString()} ${t("meetingAgent.characters")}`].filter(Boolean).join(" · ")}</small>
                      {(attachment.kind === "audio" || attachment.kind === "video") && (
                        <small className={s.mediaEvidence}>
                          <span data-ready={attachment.transcriptionStatus === "ready" || undefined}>{attachment.transcriptionStatus === "ready" ? t("meetingAgent.transcriptReady").replace("{count}", String(attachment.transcriptSegmentCount ?? 0)) : t("meetingAgent.transcriptMissing")}</span>
                          {attachment.kind === "video" && <span data-ready={attachment.visionStatus === "ready" || undefined}>{attachment.visionStatus === "ready" ? t("meetingAgent.visionReady").replace("{count}", String(attachment.keyframeCount ?? 0)) : t("meetingAgent.visionMissing")}</span>}
                        </small>
                      )}
                      {attachment.warnings?.map((warning) => <small key={warning} className={s.fileWarning}>{warning}</small>)}
                      {mediaEvidenceBlocked && attachment.error && <small className={s.fileWarning}>{attachment.error}</small>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachments((current) => current.filter((candidate) => candidate !== attachment))}
                      aria-label={`${t("meetingAgent.removeFile")}: ${attachment.name}`}
                    >×</button>
                  </li>
                ))}
              </ul>
            )}
            <div className={s.sourceCount} data-over-limit={sourceLimitExceeded || undefined}>
              {totalSourceChars.toLocaleString()} / {MEETING_SOURCE_MAX_CHARS.toLocaleString()} {t("meetingAgent.characters")}
            </div>
            {(uploadError || sourceLimitExceeded) && (
              <div className={s.uploadError} role="alert">
                {uploadError || t("meetingAgent.sourceTooLong")}
              </div>
            )}
            {mediaEvidenceBlocked && <div className={s.uploadError} role="alert">{t("meetingAgent.mediaEvidenceUnavailable")}</div>}
            <div className={s.uploadStatus} aria-live="polite">
              {uploading ? t("meetingAgent.analyzingMedia") : attachments.length > 0 && !mediaEvidenceBlocked ? t("meetingAgent.filesReady") : ""}
            </div>
          </section>

          <div className={s.outputRow}>
            <div>
              <span>{t("meetingAgent.outputIncludes")}</span>
              <p>{t("meetingAgent.outputList")}</p>
            </div>
            <label className={s.language}>
              <span>{t("meetingAgent.language")}</span>
              <select value={outputLanguage} onChange={(event) => setOutputLanguage(event.target.value as MeetingOutputLanguage)}>
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>

          <footer className={s.footer}>
            <p>{t("meetingAgent.reviewNote")}</p>
            <div>
              <button type="button" className={s.secondary} onClick={onClose}>{t("common.cancel")}</button>
              <button type="submit" className={s.primary} disabled={!canLaunch}>{t("meetingAgent.launch")}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
