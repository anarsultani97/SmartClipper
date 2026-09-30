# Local development and review

Date: 2026-10-01.

## Scope

This build supports local MP4 import, persistent project metadata, asynchronous preparation, preview playback, MP3 download, and saved timeline ranges. It runs as a single-user localhost app. The API has origin/host checks but no production user authentication or tenant separation. Do not expose it through a public tunnel or deploy it as a shared service.

Upload is a bounded raw HTTP body to the API, stored on local disk. Hosted resumable uploads, S3, PostgreSQL, Celery, full cancellation/leases, quotas, and retention are future work. Queued imports survive API/browser restarts. One local worker is supported; on restart it marks interrupted processing as failed so users can explicitly retry.

## Setup

Install supported Node.js, Python (3.12 recommended; 3.10 also tested), uv, and FFmpeg/ffprobe. Clone the branch and run from the repository root:

~~~sh
npm ci
uv sync --locked
uv run alembic upgrade head
~~~

If uv is installed inside .venv on Windows, invoke it with:

~~~powershell
& .\.venv\Scripts\uv.exe sync --locked
~~~

Copy .env.example to .env when overriding paths or limits. Set SMARTCLIPPER_FFMPEG_PATH and SMARTCLIPPER_FFPROBE_PATH to installed executable paths if they are not on PATH. Use forward slashes in Windows .env paths. Keep .env and media outside version control.

Start three terminals:

~~~sh
uv run uvicorn smartclipper_api.app:app --host 127.0.0.1 --port 8000
uv run python -m smartclipper_api.worker
npm run dev
~~~

Open http://127.0.0.1:5173. Review alternatives at /?review. API docs: http://127.0.0.1:8000/docs.

The default import cap is 200 MB and 30 minutes. Original files remain untouched. A project folder holds source.mp4, preview.mp4, thumbnail.jpg, and audio.mp3 if an audio stream exists. Metadata and selections live in data/smartclipper.db. Preparation failures preserve the source for retry. Manual cleanup/retention management is required during this local slice.

## Database and contracts

Alembic owns schema changes; do not use ORM create_all in application startup. It is used only for isolated test databases. Add a migration when changing persisted fields. The hosted PostgreSQL rollout requires its own migration/transaction checks.

Generate contracts after API schema changes:

~~~sh
uv run python tooling/export-openapi.py
npm exec --workspace @smartclipper/web -- openapi-typescript ../../packages/contracts/openapi.json -o src/generated/api.d.ts
npm run format
~~~

Commit OpenAPI and generated TypeScript alongside their source API changes.

## Validation commands

~~~sh
uv run pytest
uv run ruff check .
uv run ruff format --check .
npm test
npm run format:check
npm run build
npm exec --workspace @smartclipper/web -- playwright install chromium
npm run test:e2e
~~~

Native integration tests generate tiny MP4s and process them through the real worker. They skip when FFmpeg/ffprobe are absent; CI installs them and reruns those checks. Browser tests isolate network data for deterministic UI journeys. Internet downloads never run implicitly in unit tests.

CI actions follow their current official usage: [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), and [setup-uv](https://github.com/astral-sh/setup-uv). uv is pinned to 0.12.21 and dependencies are locked.

For optional podcast smoke tests, start the API and stop the persistent worker, then run:

~~~sh
uv run python tooling/test-podcast-imports.py
node tooling/check-live-review.mjs
~~~

The script downloads 12-second excerpts of two explicitly listed public podcast URLs into ignored .cache/fixtures, imports through the API, runs the local worker, and checks preview byte ranges and MP3. It writes ignored evidence in .cache/podcast-smoke.json. Keep third-party media out of commits. Source availability may change.

Capture empty-state design screenshots with the app/API running:

~~~sh
node tooling/capture-review.mjs
~~~

## Known limits and next step

- No transcript upload/recognition or AI-generated candidates yet.
- Saved ranges are preparation-preview ranges; robust VFR/audio-offset/source-to-output mappings need the next media stages before accurate short rendering.
- Preview is capped to 1280x720; final-quality rendering is not implemented.
- No automatic crop, captions, short MP4 export, social publishing, production authentication, or cloud storage.
- Imported video validation happens asynchronously; invalid content may appear queued before rejection.
- No processing cancellation, multiple-worker recovery leases, or automatic retention yet.
- Browser coverage currently exercises Chromium; Safari/macOS and Linux worker deployment need later acceptance runs.

Next implementation: transcript ingestion/recognition and source-time normalization, then context-based suggestions and bad-scene quality filters. Keep the first hosted authentication/storage/queue work separately reviewable.
