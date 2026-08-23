# Meeting media understanding

DTA processes meeting recordings as two evidence streams and joins them by timestamp. It does not ask one model to infer an entire video in a single opaque request.

```text
video/audio upload
  -> optional fail-closed malware scan
  -> configured ArtifactStore (original source)
  -> FFprobe (duration and streams)
  -> FFmpeg audio extraction -> transcription provider -> timestamped transcript artifact
  -> FFmpeg keyframes -> vision provider -> visual analysis artifact
  -> synchronized meeting timeline artifact
  -> Meeting Agent -> summary, decisions, actions, requirements
```

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

The Meeting Agent receives the timeline content plus artifact identifiers. It must still separate confirmed decisions from proposals and mark missing owners, dates, or ambiguous evidence for human confirmation.

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

Media extraction currently runs synchronously inside the Next.js process. A production deployment should keep `replicas: 1` until run state and jobs are moved to Postgres/Redis and a durable worker queue. Very long recordings should eventually use asynchronous chunked transcription. Speaker labels are retained when the configured transcription service returns them; DTA does not fabricate diarization.
