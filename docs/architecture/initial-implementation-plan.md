# SmartClipper: Web Application Workflow and Implementation Plan

Date: 2026-10-01
Status: Web roadmap with a working guided beta; supersedes the desktop workflow.
Related: [web stack decision](0002-web-stack.md), [technology stack](tech-stack.md), [team workflow](../development/team-workflow.md).

## 1. Product scope

Build a browser application for Windows and macOS users. A user uploads a long video, optionally supplies a transcript, receives 4-5 meaningful short suggestions, reviews them in a video/timeline workspace, and downloads approved shorts and extracted MP3. Social account connection and publishing come later.

Start with speech-led interviews, podcasts, tutorials, and presentations. Suggestions should preserve the speaker's meaning, have a clear opening and payoff, and avoid unusable scenes. Produce fewer than five when insufficient good material exists; explain why. Do not promise virality. Silent footage and heavily edited entertainment need a later visual-first strategy.

Proposed defaults: five continuous clips, usually 30-60 seconds, configurable by the user. Keep the source immutable. Trimming, captions, crop, and fit are editable metadata until export.

This specifies the target implementation and validation. The current beta implements the guided UI, accounts/ownership, import/database/worker, timed SRT/local transcription, English translation, quality sampling, up to five suggestions, vertical caption/music exports and thumbnail editing. Local selection is transcript scoring; optional hosted semantic ranking requires configuration. See [the current architecture](0003-short-generation.md) and [local development](../development/local-development.md). Hosted services and advanced editor work remain planned. The desktop scaffold is historical.

### Current milestones, one by one

1. **Guided foundation — implemented.** One UI direction, large preview and timeline, persisted account-owned uploads, MP3 and source review.
2. **Generation beta — implemented.** Twelve language selections (including Turkish and Azerbaijani) plus auto-detection, timed SRT or local recognition, optional English captions, configurable platform/length/count and a separate results page.
3. **Review and export — implemented.** Three context sentences, caption toggles, titles, original music beds, up to three clear covers, a cover editor/custom upload/frame capture, and asynchronous 720×1280 downloads.
4. **Usage visibility — implemented.** Personal and allowlisted operator aggregate dashboards, requested on demand. Playback/download/click analytics are deliberately not collected.
5. **Quality and editor acceptance — next.** Native-speaker tests for each language, real OAuth consent with configured apps, VFR/rotation/audio-offset fixtures, stronger semantic ranking evaluation, better automatic framing and original-source-quality exports.
6. **Hosted beta — next.** PostgreSQL transaction/migration acceptance, private object storage, resumable upload, distributed worker leases, quotas, retention, account recovery/verification and privacy controls.
7. **Social integrations — later.** Explicit user-authorized publishing, platform metadata/cover rules and licensed trend catalog access. No embedded chart hits or fabricated trend rankings.

The detailed sections below describe the eventual hosted target. Their object storage, alignment, crop, cancellation and advanced editor features are not claims about the current local beta.

## 2. User workflow, step by step

1. **Sign in and create a project.** Select video, language if known, audience, short style, duration, and desired count. Show file limits, upload estimates, and retention before upload.
2. **Upload with retry.** Send video directly to private object storage through temporary authorized URLs. Multipart uploads retry failed parts. Upload time is a real constraint; processing speed cannot compensate for a slow connection.
3. **Optionally upload a transcript.** Accept SRT, VTT, or TXT. Validate timed transcripts against the source; align plain text with audio before it can drive cuts.
4. **Analyze in the background.** Show upload, queue, preparation, transcription, context selection, quality review, and readiness separately. Report measured stage progress without inventing total percentages for unknown AI latency.
5. **Review suggestions.** Cards show title, thumbnail, duration, source range, why the moment works, and quality/transcript caveats. Allow rejection and budgeted alternative generation.
6. **Edit in a workspace.** Play source or short, navigate transcript, trim on a timeline, choose vertical crop/fit, and toggle captions. Autosave revisions and surface conflicts.
7. **Export and download.** Export chosen revisions in the background. Provide MP4, optional SRT, and MP3 downloads with visible expiry. Re-export while the source remains available.

Closing the tab does not stop server jobs. Reopening retrieves saved state. Cancellation covers processing and export; aborting an upload releases incomplete storage parts.

## 3. Architecture

~~~mermaid
flowchart LR
    B[React browser app] -->|authenticated REST| A[FastAPI]
    B -->|authorized multipart upload| S[Private object storage]
    A --> P[(PostgreSQL)]
    A -->|outbox dispatcher| Q[Redis / Celery]
    Q --> W[Python workers]
    W --> F[FFmpeg / ffprobe]
    W --> T[Transcription adapter]
    W --> L[Context / highlight adapter]
    W --> P
    W --> S
    A -->|job state and media authorization| B
    S -->|temporary preview / download URLs| B
~~~

| Component | Responsibility |
| --- | --- |
| React | Upload, project navigation, HTML video playback, transcript, timeline, clip choices, export status |
| FastAPI | Authentication/ownership, upload sessions, metadata, validation, edits, jobs, cancellation, temporary media access |
| Workers | Source retrieval, probing, extraction, transcription, quality/context analysis, rendering |
| PostgreSQL | Authoritative ownership, source assets, revisions, jobs/checkpoints, quotas, artifacts, outbox |
| Object storage | Private sources, audio, proxies, waveforms, thumbnails, transcripts, exports |
| Redis/Celery | Dispatch/execution; database state governs recovery |

Heavy media work runs in independent workers. FastAPI recommends tools such as Celery for substantial background computation across processes or servers. [FastAPI background tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)

Start with one API and one worker codebase. Separate CPU/GPU deployment when measurement supports it. Avoid a microservice per pipeline stage. Provider credentials stay on servers.

## 4. Uploads, ownership, and source validation

### Upload protocol

1. API authenticates the user, checks quotas, creates a project asset/upload session, and generates an opaque owner/project-scoped object key.
2. Browser receives short-lived URLs for a bounded set of parts; no storage account credentials or arbitrary storage paths.
3. Browser uploads with limited concurrency and individual retries. Persist upload ID, part numbers, ETags/checksums, and selected-file metadata. After restart, reselect the file if necessary and verify it matches before resuming.
4. API completes the upload after checking ownership and part metadata. Verify the stored object's existence, size, and integrity metadata; browser success alone is insufficient.
5. Commit source readiness and a job/outbox record in one database transaction. Dispatcher queues it; reconciler repairs missed dispatches. Idempotency keys prevent duplicate completion jobs.
6. Expire abandoned sessions and abort incomplete multipart uploads. Replacements use new keys so signed uploads cannot overwrite other revisions.

S3 presigned URLs grant temporary upload access without exposing AWS credentials. Multipart upload permits independent retries and assembly after completion. Configure storage CORS and exposed upload response headers. [Presigned uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html), [multipart uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)

### Validation and isolation

Authorize every project, asset, job, edit, and download by owner. Start with per-user projects; organizations can extend this later. Prefer same-origin deployment and secure sessions with CSRF protection for cookie-authenticated mutations.

Probe actual containers/streams; filenames and browser MIME types are hints. Enforce bytes, duration, resolution, stream count, scratch storage, and processing-time limits. Run FFmpeg with argument arrays, restricted input protocols, and local worker paths. Remote media URL import is deferred. Isolate media processing in bounded containers with restricted network access; only approved adapters call external providers.

Normalize a single source timeline, recording rotation, VFR/frame rate, stream offsets, channel layout, and duration. Maintain explicit mappings among source, transcript, proxy, and edited output timestamps.

## 5. Audio extraction and playback

Extract analysis audio once; generate optional downloadable MP3 separately and cache it. Avoid converting compressed MP3 back into transcription audio.

~~~sh
# Analysis audio; select the intended audio stream after probing.
ffmpeg -i input.mp4 -map 0:a:0 -vn -ac 1 -ar 16000 -c:a pcm_s16le analysis.wav

# User-requested audio extraction.
ffmpeg -i input.mp4 -map 0:a:0 -vn -c:a libmp3lame -q:a 2 audio.mp3
~~~

Production invocation also needs validated paths, overwrite policy, progress, limits, and cancellation. Handle missing audio, multiple tracks, and decode failures explicitly.

Generate a lightweight H.264/AAC MP4 proxy with compatible pixel format, normalized orientation, and fast-start metadata. Serve byte ranges with correct CORS. Map proxy timestamps explicitly instead of assuming offsets survive re-encoding.

A playable local file may use a temporary browser object URL during upload; server assets become authoritative after preparation. Revoke object URLs when finished. Generate waveform summaries and thumbnail sheets server-side and load by timeline viewport.

Initial suggestions preview bounded ranges in one proxy. Render exact crop/caption previews on demand. Final exports use source quality. Evaluate HLS only if measured playback/seek problems justify it.

## 6. Transcript ingestion and recognition

Provider-independent contract:

~~~text
TranscriptRevision: id, source_asset_id, language, provider, model_version,
                    timing_basis, alignment_status, created_at
Segment: id, start_ms, end_ms, text, optional speaker,
         optional confidence, optional words[{text,start_ms,end_ms}]
~~~

Use integer milliseconds and half-open source ranges [start_ms, end_ms). IDs remain stable within a revision; clips reference that revision.

### Supplied transcript

- **SRT/VTT:** parse server-side, sanitize display text, validate order, bounds, overlaps, and timing. Sample audio alignment. Substantial mismatch may indicate a different edit; request correction.
- **TXT:** align text with audio through an adapter. Untimed text cannot supply valid cut timestamps. If alignment fails, offer automatic transcription or manual timing.
- Preserve original and normalized revisions. Transcript edits invalidate context/suggestions, while audio preparation remains reusable.

### Automatic transcription

Start with a **faster-whisper** server adapter. Benchmark CPU quantization and GPU deployment; use word timestamps and voice activity detection where appropriate. Its CTranslate2 runtime supports CPU/GPU execution; batching trades memory for throughput, requiring measurement on our hardware. [faster-whisper documentation](https://github.com/SYSTRAN/faster-whisper)

Preload models in persistent workers. Choose model/precision by language accuracy, caption timing, throughput, and memory. Handle chunk overlap/deduplication, silence, music, and low-confidence speech. Do not treat hallucinated speech as reliable context.

Keep optional hosted ASR behind an adapter. Verify current file limits, language/timestamp support, pricing, and retention before implementation; disclose external processing. Evaluate forced alignment such as WhisperX where timing is inadequate, subject to language support and model licenses. [WhisperX](https://github.com/m-bain/whisperX)

## 7. Context and meaningful clip selection

1. Build a hierarchical topic map: summary, speaker intent, topic boundaries, examples, claims, and conclusions. Long transcripts use bounded chunks with overlap and a compact combined outline.
2. Generate 10-15 candidates referencing existing segment IDs. Prefer a hook, standalone value, and payoff; check whether pronouns/claims need preceding context.
3. Expand boundaries to coherent speech/topic boundaries within source and duration limits. First-release clips remain continuous; montages come later.
4. Rank by coherence, audience relevance, information value, opening strength, and source quality. Deduplicate overlapping moments/repeated ideas and favor topic diversity.
5. Validate structured model responses against the transcript revision. Resolve time deterministically from segment IDs; reject invented IDs, quotes, and invalid ranges.
6. Combine context judgments with quality findings and select 4-5 viable candidates. Return fewer with an explanation when needed.
7. Show titles/reasons and optional caption/title suggestions for user review. Do not silently rewrite spoken claims or publish.

Versioned ClipPlan stores project/source IDs, transcript revision, selected segment IDs, source ranges, title, rationale, quality findings, crop/fit, captions, and edit revision. Store evidence and brief explanations rather than requesting internal model reasoning.

Use text first, then a few representative frames when visual context matters. Avoid entire-video requests and repeating complete transcripts per candidate. Cache topic/candidate analysis by input/model/prompt version. Bound output tokens, retries, candidates, and per-project inference cost.

Development profiles remain Luna for lightweight tasks, Sol for medium work, and Astra for architecture/high priority. These do not configure production AI. Choose runtime models independently by supported APIs, measured quality, cost, latency, and data handling.

## 8. Bad-scene filtering without breaking meaning

Run inexpensive coarse checks during audio preparation, then denser analysis around shortlisted ranges and nearby boundaries.

- Detect sustained black/frozen frames, severe blur, corrupt/undecodable frames, and missing usable video. Calibrate durations/thresholds on representative footage. [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html)
- Use scene-cut detection to improve boundaries through an adapter such as PySceneDetect. Validate on slides, fades, and camera cuts. [PySceneDetect](https://www.scenedetect.com/docs/latest/)
- Missing faces/object detections do not imply unusable footage; slides, screens, and intentional darkness can carry context.
- Reject decode failures and sustained unusable footage; judge brief transitions by duration/context.
- Prefer replacing the candidate or adjusting its boundary when damage overlaps speech. Do not remove spoken evidence just to hide blur. Later internal cuts must remap audio/captions/timeline together and flag semantic discontinuities.

Record findings as timestamped evidence with severity and detector/settings version; allow user preview and override. Quality scores triage footage; they do not predict virality.

## 9. Browser review workspace

~~~text
+------------------+-----------------------------+--------------------+
| Suggested shorts | Video: source / selected    | Transcript /       |
| title + reason   | Crop, fit, caption preview  | searchable context |
| duration + flags | Playback and trim controls  | click to seek      |
+------------------+-----------------------------+--------------------+
| Timeline: thumbnails, waveform, speech, scene cuts, quality flags   |
| Source time ruler, selected range, zoom, snapping, in/out handles    |
+--------------------------------------------------------------------+
| Save status | alternatives | export selected | persistent job status |
+--------------------------------------------------------------------+
~~~

Use HTML video with Canvas/SVG timeline. Virtualize long transcripts and fetch waveforms/thumbnails by viewport. Pointer interactions stay local; debounce metadata saves. Support keyboard playback, seeking, selection, and trimming.

Start with polling persisted job state, resuming on focus/reconnect. Add server-sent events later with event sequencing/state reconciliation so missed events cannot strand the UI. Refresh expiring media URLs while preserving edit/playback position.

Use optimistic revision checks (If-Match or equivalent) and explicit conflicts between tabs. Exports capture an immutable revision, so edits during rendering do not change that export.

## 10. Durable jobs, cancellation, and recovery

Persist queued/running/completed/failed/cancelled states, stage, attempt, heartbeat, cancellation request, timestamps, error codes, and artifacts. Upload session state is separate. Retries record new attempts without erasing previous errors.

Treat delivery as at least once. Claim jobs through database leases and heartbeat renewal. Publish outputs atomically through deterministic or versioned keys plus committed manifests. Repeated delivery must not duplicate suggestions/exports. Configure Celery acknowledgments and visibility timeouts alongside leases for long-running work. [Celery tasks](https://docs.celeryq.dev/en/stable/userguide/tasks.html)

Checkpoint preparation, transcript, context, quality, and export. Bound retries with backoff for transient failures; fail unsupported input promptly. Reconcile stale leases and outbox entries. Recover AI timeouts without re-uploading valid media.

Cancellation is persisted. Workers check between stages and during long operations, stop their FFmpeg process group, discard partial artifacts, and release leases/scratch. Queue revocation alone is insufficient. Cleanup also handles crashes.

Limit active jobs per user, native threads, GPU memory, provider concurrency, disk, and retries. Separate interactive analysis from bulk exports if necessary; add fair scheduling before broad release.

## 11. Export, retention, and deployment

### Export

Start with MP4 H.264/AAC, vertical 9:16, manual crop or fit, optional burned captions and SRT. Re-encode accurate cuts rather than keyframe-limited stream copy. Apply time mappings to captions and any removed intervals; validate synchronization.

Batch exports are independent jobs. Cache by source fingerprint, clip revision, and render settings. Signed downloads expire; reauthorize every new URL request.

### Storage lifecycle

Proposed beta defaults: seven-day source/proxy/export retention, scratch cleanup within 24 hours. Confirm before implementation and display expiry/explicit deletion. Transcript and metadata retention follows a published policy including their sensitivity. Expired sources require re-upload for rendering; project state must reflect this.

Delete artifacts through a retried cleanup job, including multipart sessions and provider artifacts where applicable. Define backup expiry separately. Encrypt storage, keep buckets private, exclude transcript/media contents from logs, and redact signed URLs/credentials.

### Deployment

Develop with Docker Compose: API, worker, PostgreSQL, Redis, and an explicitly selected S3-compatible development target. Prefer Linux backend containers on Windows/macOS development machines, with a CPU path requiring no GPU.

Deploy static React via CDN/reverse proxy, same-origin /api to FastAPI, and long-lived worker containers. Prefer managed storage/database/queue services where practical. Start in one region chosen for users, privacy, and upload latency. Keep media transfer out of API memory. GPU workers are a measured scaling choice; Kubernetes is unnecessary initially.

Record tool/model versions and FFmpeg build flags. Review codec, FFmpeg, and model licensing before beta. Social connections, mobile-first editing, collaborative live editing, and browser-side encoding remain later work.

## 12. Proposed codebase and scaffold migration

Create this structure with the first implementation PR; this documentation commit does not create runnable services:

~~~text
apps/web/src/
  app/                         routing, providers, composition
  features/                    upload, projects, review, editor, exports
  shared/                      UI primitives, API client, media helpers
services/api/src/smartclipper_api/
  routes/                      authenticated versioned HTTP endpoints
  application/                 project, upload, edit, job commands
  auth/                        sessions and ownership
  persistence/                 repositories and migrations
services/worker/src/smartclipper_worker/
  tasks/                       Celery entry points and stage dispatch
  runtime/                     leases, cancellation, scratch lifecycle
packages/media-engine/src/smartclipper_engine/
  domain/                      ranges, transcripts, clip plans, findings
  pipeline/                    reusable processing stages
  adapters/                    media, transcription, context, quality
packages/contracts/            OpenAPI-generated TS types and schemas
infra/                         containers and deployment templates
tests/                         contracts, integration, browser, fixtures
docs/                          decisions, milestones, developer guides
tooling/                       development helpers
.codex/                        development model profiles
~~~

Retire apps/desktop and engine desktop ipc/ when scaffolding runnable web services; preserve useful React/domain boundaries. Queue orchestration belongs in services/worker; algorithms stay independent of HTTP/Celery. Share backend persistence only where needed and assign explicit migration ownership. Generate frontend API types from FastAPI OpenAPI.

Core entities: User, Project, SourceAsset, UploadSession, TranscriptRevision, ClipPlanRevision, ProcessingJob, JobAttempt, Artifact, OutboxEvent. All project-owned records enforce ownership references.

API groups under /api/v1: projects; upload sessions/parts/complete/abort; jobs/status/cancel/retry; transcript revisions; suggestions; clip revisions; exports; artifact access. Job creation returns HTTP 202 and stable job ID. Completion/retry/export accept idempotency keys; all groups apply ownership, revisions, and quotas.

## 13. Implementation milestones, one by one

Each milestone delivers an end-to-end increment. These acceptance checks are future implementation work, not checks performed by this documentation update.

### Milestone 0 — Web foundation and contracts

- Scaffold React/Vite, FastAPI, worker, lockfiles, Linux containers, local services, and environment examples.
- Establish sign-in, ownership, limits, migrations, generated API types, typed errors, correlation IDs, and basic CI.
- Define time conventions, job states, artifacts, clip revisions, uploads, and cancellation.
- **Acceptance:** two users cannot access one another's projects; local UI/API/worker start reproducibly; CPU-only setup is documented.

### Milestone 1 — Upload to manually trimmed downloadable clip

- Implement multipart upload/finalization, outbox dispatch, ffprobe validation, proxy, waveform, thumbnails, and MP3.
- Display source/timeline; choose one range; asynchronously export and download MP4/MP3.
- **Acceptance:** complete path works; part retry and duplicate completion are safe; unsupported/no-audio inputs have clear outcomes; closing tabs preserves jobs; cancellation/restart recovers and frees resources.

### Milestone 2 — Supplied and automatic transcripts

- Parse SRT/VTT, align TXT, integrate faster-whisper, normalize timing, and show seekable transcript.
- Add revisions, language selection, mismatch feedback, and caches.
- **Acceptance:** accents/languages, silence, VFR, and audio offsets preserve timing; supplied transcripts skip ASR only when usable; retries reuse audio.

### Milestone 3 — Context-based suggestions

- Implement topic mapping, candidate generation, deterministic time resolution, ranking, and deduplication.
- Show 4-5 cards/reasons/previews, fewer when appropriate, and budgeted alternatives.
- **Acceptance:** no invented references; cuts preserve context; topics vary; editors rate coherence/usefulness. Measure token cost and time to first useful suggestion.

### Milestone 4 — Quality filtering and safe boundaries

- Add black/blur/decode/freeze evidence, scene boundaries, coarse-to-dense checks, and candidate replacement.
- **Acceptance:** annotated footage rejects bad scenes while preserving slides, intentional transitions, and speech. Never pad to five.

### Milestone 5 — Full review workspace

- Add zoomable timeline, transcript search/seek, snapping, trim handles, quality markers, autosave/conflicts, and source/short playback.
- **Acceptance:** long-video UI remains responsive; keyboard works; reconnect/URL renewal recovers; multiple tabs detect conflicts; review time improves over manual cutting.

### Milestone 6 — Captions, framing, and batch export

- Add crop/fit, caption styling, exact previews, batch jobs, SRT, and immutable render snapshots.
- **Acceptance:** A/V/caption timing matches the selected revision; portrait/screens remain readable; edits during export do not alter active output.

### Milestone 7 — Performance, recovery, and cost

- Tune model/precision/batching, lazy previews, caches, fair queues, bounded retries, budgets, and retention.
- **Acceptance:** crashes, duplicate delivery, expired URLs, disk pressure, and cancellation cannot strand projects. Measure warm/cold latency and storage/compute/token cost under concurrency.

### Milestone 8 — Hosted beta

- Deploy staging/production, backups/recovery, monitored jobs, rate limits, privacy/retention/deletion, and dashboards.
- **Acceptance:** browser journeys on Chrome/Edge Windows and Safari/Chrome macOS; ownership/media authorization checks; limits under load; restore and recovery exercises.

### Milestone 9 — Social publishing, later

- Evaluate OAuth/provider permissions, token storage, format limits, scheduling, and callbacks.
- Begin after reliable downloads; require explicit user action to publish.

## 14. Performance and validation strategy

Track upload time, queue wait, preparation/transcription/selection time, time to first useful suggestion, review duration, transcription real-time factor, export FPS, peak CPU/GPU memory, scratch usage, and total cost. Separate cold-model startup, warm processing, and upload.

Benchmark CPU development and representative Linux GPU workers. Exercise slow/interrupted uploads, concurrent users, long videos, VFR/audio offsets, rotation, multiple languages, silence, slides, low light, fades, blur, and damaged inputs. Use consented fixtures with editor-labeled quality and meaningful clips.

Cache within ownership boundaries by source checksum/fingerprint, pipeline/model/prompt/settings, and transcript/edit revision. Avoid cross-user deduplication initially. Crop changes invalidate renders, transcript changes invalidate context, and neither requires repeated audio extraction.

Set latency/quality release targets from the first measured slice. Architecture choices are proposals; performance is not promised before measurement.

## 15. First implementation task list

1. Agree on limits, languages, duration, retention, and processing-cost ceiling.
2. Create web/API/worker manifests and locks; retire legacy desktop scaffold in that implementation PR.
3. Add local PostgreSQL/Redis/storage configuration and CPU worker container.
4. Implement authenticated project/upload contracts and ownership checks.
5. Upload, finalize, verify, and dispatch via database outbox.
6. Add bounded ffprobe/FFmpeg preparation and durable progress/cancellation.
7. Show proxy, waveform, and one editable range.
8. Render an immutable revision; authorize MP4/MP3 downloads.
9. Exercise retry, tab closure, worker restart, duplicate dispatch, and two-user isolation.
10. Record latency/cost baseline, then add transcription before AI suggestions.

This slice proves the entire web media path and is the practical starting point for implementation and testing.
