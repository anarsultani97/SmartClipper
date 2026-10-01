# SmartClipper web technology stack

Date: 2026-10-01. Status: guided beta implemented; versions are pinned in lockfiles. Python 3.12+ is the supported baseline.

## Application layers

| Layer | Choice | Purpose |
| --- | --- | --- |
| Browser | React, TypeScript, Vite; semantic HTML and CSS | Upload, library, video review, timeline, downloads |
| Client state | React state initially; TanStack Query when needed | Local editing and server state without duplicating persisted state |
| API | Python, FastAPI, Pydantic | Validated versioned REST and OpenAPI contracts |
| Authentication | Authlib, Argon2, opaque SQL sessions | Google/Facebook adapters, email login, CSRF and ownership |
| Database | SQLAlchemy 2, Alembic; PostgreSQL for hosted app | Projects, ownership, media metadata, revisions, jobs |
| Local review database | SQLite | Zero-service developer setup; same ORM and explicit migrations |
| Processing | Independent Python worker; Celery/Redis for hosted pipeline | Durable asynchronous CPU/GPU jobs |
| Media | FFmpeg, ffprobe | Probe, extraction, proxy, quality filters, rendering |
| Transcription | faster-whisper behind an adapter | CPU development and optional Linux GPU workers |
| Quality | FFmpeg sparse decoding, NumPy/Pillow | Brightness/blur checks and cover selection; fuller scene analysis later |
| AI | Provider-independent structured context adapter | Topic mapping and candidate selection |
| Media storage | Private S3-compatible object storage when hosted | Direct multipart uploads, signed previews/downloads |
| Local review storage | Ignored local data directory | Small-file import and playback during initial development |
| Tooling | npm workspace and lockfile initially; uv for Python | Reproducible dependencies |
| Tests | pytest, Vitest, React Testing Library, Playwright | Domain, API, UI, browser journeys |
| Activity | Indexed database aggregates, native React/CSS | Personal/operator dashboards on demand; no tracking SDK |
| Deployment | Linux containers, static CDN/reverse proxy | Independent API and worker scaling |

## Initial implementation boundary

The guided beta implements account-owned imports, local recognition/translation, transcript-based suggestions, quality checks, vertical exports, covers and aggregate activity. SQLite/local disk remain the developer setup. Bind to localhost; production hosting is a separate milestone. See [the current generation decision](0003-short-generation.md) for working boundaries and deferred release gates.

The local editor now supports reversible source/short trim and picture/audio adjustments, vertical or horizontal exports, and a timeline-ordered shorts feed. See [ADR 0005](0005-reversible-video-editor.md) for media clocks, preview costs and the editor boundary.

Clivvy is the current working product name. Public social-video links use an isolated yt-dlp subprocess; the sound studio uses native browser recording, immutable owned WAV assets and FFmpeg mixing. See [ADR 0006](0006-link-import-audio-studio.md) for bounds, music catalogs and provider integrations.

The hosted release migrates to PostgreSQL, private object storage, authenticated ownership, durable workers, quotas, and retention. ORM portability alone does not replace testing PostgreSQL migrations and transaction semantics. Do not deploy the local review build publicly.

## Browser editor

Use HTML video playback, a responsive CSS layout, and Canvas/SVG timeline. Precompute waveforms/thumbnails on workers. Virtualize transcript rows and fetch detail by viewport. Keep trim/crop/caption metadata separate from rendered media. Poll authoritative job status initially; SSE can be added with reconnection/state recovery.

Generate TypeScript API types from FastAPI OpenAPI. Validate clip revisions and source-time ranges on the server. Keep provider secrets out of frontend environment variables.

## Speed and cost decisions

- Native FFmpeg handles expensive media transforms; Python orchestrates it. Custom C++/Rust is justified only by measured bottlenecks.
- Persist prepared audio/transcripts/scenes and invalidate only dependent stages.
- Preload transcription models, bound native thread counts, and benchmark quantization/batching.
- Use transcript-first context analysis and sparse frames with input/output budgets.
- Return suggestion metadata before rendering every full-quality clip.
- Include upload and queue wait in latency metrics; cloud processing cannot eliminate transfer time.

## Version and licensing policy

Pin dependencies and commit lockfiles during scaffolding. Use supported Node/Python releases compatible with selected dependencies; validate native transcription/CUDA compatibility before GPU rollout. Record FFmpeg build flags, codec licenses, model weights/license, and runtime versions. Keep upgrades focused with checks and release notes.

## References

- [Vite guide](https://vite.dev/guide/)
- [FastAPI heavy background tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- [SQLAlchemy tutorial](https://docs.sqlalchemy.org/en/20/tutorial/)
- [Celery tasks](https://docs.celeryq.dev/en/stable/userguide/tasks.html)
- [S3 multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html)
- [Vitest](https://vitest.dev/guide/)

See the [implementation plan](initial-implementation-plan.md) for workflow, contracts, milestones, and acceptance criteria.
