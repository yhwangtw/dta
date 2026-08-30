# Meeting media understanding

DTA processes meeting recordings as two evidence streams and joins them by timestamp. It does not ask one model to infer an entire video in a single opaque request.

```text
video/audio upload
  -> optional fail-closed malware scan
  -> configured ArtifactStore (original source)
  -> persistent media job (queued/processing/progress)
  -> FFprobe (duration and streams)
  -> FFmpeg audio extraction -> transcription provider -> timestamped transcript artifact
  -> FFmpeg keyframes -> vision provider -> visual analysis artifact
  -> synchronized meeting timeline artifact
  -> Meeting Agent -> summary, decisions, actions, requirements
```

The upload endpoint returns HTTP `202` for media and a `jobId`. The Web UI and
`dta` CLI poll the owner-protected job resource before adding evidence to a
Meeting request. Jobs survive the upload request, support cancellation, and can
be retried up to `DTA_MEDIA_JOB_MAX_ATTEMPTS`. `DTA_MEDIA_JOB_CONCURRENCY`
bounds provider/FFmpeg work in the single DTA process.

```text
GET    /api/meeting-agent/media-jobs
GET    /api/meeting-agent/media-jobs/{jobId}
POST   /api/meeting-agent/media-jobs/{jobId}   # retry failed/cancelled
DELETE /api/meeting-agent/media-jobs/{jobId}   # cancel
```

A server restart marks an interrupted job failed and retryable. DTA does not
silently replay an interrupted transcription or vision call.

## Providers

`DTA_TRANSCRIPTION_PROVIDER=openai-compatible` calls an OpenAI-compatible `POST /audio/transcriptions` endpoint using multipart form data and requests segment timestamps. Set `DTA_TRANSCRIPTION_BASE_URL`, `DTA_TRANSCRIPTION_MODEL`, and optionally `DTA_TRANSCRIPTION_API_KEY`.

`DTA_TRANSCRIPTION_RESPONSE_FORMAT=auto` selects `diarized_json` for diarization models, `json` for GPT-4o transcription models, and `verbose_json` for Whisper-compatible models. Override it only when the company gateway requires a fixed format.

`DTA_VISION_PROVIDER=openai-compatible` calls an OpenAI-compatible `POST /chat/completions` endpoint with sampled JPEG keyframes. Set `DTA_VISION_BASE_URL`, `DTA_VISION_MODEL`, and optionally `DTA_VISION_API_KEY`.

Both base URLs may point at a company gateway. No company endpoint or credential is compiled into the application or image. `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` are fallback values when the media-specific variables are omitted.

Local development defaults to `none`. The `mock` providers require explicit fixtures and are disabled in production.

## Evidence artifacts

- `meeting_media`: original upload
- `meeting_audio`: normalized mono audio extracted from video
- `transcript`: text, language, segment timestamps, and provider-returned speaker labels
- `meeting_keyframe`: sampled JPEG with source timestamp
- `visual_analysis`: visible slide, whiteboard, screen-share, and demo evidence
- `meeting_timeline`: transcript and visual evidence synchronized by timestamp

The Meeting Agent receives the timeline content plus artifact identifiers. Its
MeetingResult 2.0 output gives every decision, action item, and requirement a
stable ID, evidence references, source-grounding confidence, and a
`needsConfirmation` flag. It must still separate confirmed decisions from
proposals and mark missing owners, dates, or ambiguous evidence for human
confirmation.

## Limits and security

- Maximum 8 files per request.
- Text/DOCX: 10 MB each. Audio/video: 100 MB each.
- Combined upload: 150 MB. Combined extracted context: 200,000 characters.
- Default maximum media duration: 4 hours.
- Default video sample: 12 keyframes, scaled to at most 1280 px wide.
- FFmpeg runs without a shell, inside a private temporary directory that is deleted after processing.
- Provider requests have bounded timeouts. Provider response text included in errors is truncated.
- Original media and derived artifacts use the configured `ArtifactStore`; local files are mode `0600`.
- Artifact ownership is inherited by every derived transcript, audio, keyframe, vision, and timeline record; download/delete APIs enforce the authenticated owner or explicit operational role.
- `DTA_UPLOAD_SCANNER=http` sends the bytes to a configured company scanner before storage. A configured scanner fails closed unless `DTA_UPLOAD_SCANNER_FAIL_OPEN=true` is explicitly accepted.

## Production limitations

The job record is durable, but its worker still runs inside the single Next.js
process rather than a distributed queue. Production must keep `replicas: 1`.
`request.formData()`, scanner submission, artifact writes, and each provider
request currently buffer one bounded file; chunked upload and chunked
transcription are not implemented. Speaker labels are retained when the
configured transcription service returns them; DTA does not fabricate
diarization.
