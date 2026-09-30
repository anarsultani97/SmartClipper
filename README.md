# SmartClipper

A web application that will turn long videos into 4-5 context-aware shorts and extract MP3 audio. Users upload, review in a browser video/timeline workspace, adjust, and download. Social publishing comes later.

## Current review build

Implemented foundation: React/TypeScript UI with three design directions, MP4 upload, SQLite project storage, a separate Python preparation worker, browser-compatible video preview, MP3 extraction, and saved timeline selections.

This is a **localhost, single-user review build**. Hosted authentication/ownership, resumable object-storage uploads, production queues, transcription, AI suggestions, quality filtering, captions, and short rendering are planned milestones. No generated shorts are claimed yet.

## Start locally

Requirements: supported Node.js (tested with 24), Python 3.10+ (3.12 recommended), uv, FFmpeg and ffprobe. Run from the repository root.

~~~sh
npm ci
uv sync --locked
uv run alembic upgrade head
~~~

Optionally copy .env.example to .env and configure native executable paths. Uploaded media and database files live in ignored data/; do not commit them.

Run these in three terminals:

~~~sh
uv run uvicorn smartclipper_api.app:app --host 127.0.0.1 --port 8000
uv run python -m smartclipper_api.worker
npm run dev
~~~

Open http://127.0.0.1:5173. Review all three directions at http://127.0.0.1:5173/?review. The guided direction is the default recommendation. The API docs are at http://127.0.0.1:8000/docs.

Import a real MP4 (up to 200 MB / 30 minutes), wait for preparation, open its preview, adjust the timeline range, save it, and download MP3 if audio exists. One local worker is supported. On worker restart, interrupted imports become failed/retryable; queued imports remain persisted.

## Validation

~~~sh
npm test
npm run build
uv run pytest
uv run ruff check .
npm exec --workspace @smartclipper/web -- playwright install chromium
npm run test:e2e
~~~

See [local development](docs/development/local-development.md) and [review notes](docs/design/ui-directions.md) for limitations and test evidence.

## Architecture and milestones

- [Step-by-step web workflow and milestones](docs/architecture/initial-implementation-plan.md)
- [Technology stack](docs/architecture/tech-stack.md)
- [Web architecture decision](docs/architecture/0002-web-stack.md)
- [Team branches and workflow](docs/development/team-workflow.md)

Hosted direction: React + FastAPI + PostgreSQL + private object storage + independent Python workers. FFmpeg performs native media operations; faster-whisper supplies transcription through an adapter. Context selection uses bounded transcript analysis and sparse frames. Keep the source intact and return fewer than five shorts when quality/context cannot support five.

## Codebase

~~~text
apps/web/                      React UI, unit tests, browser tests
services/api/                  FastAPI, ORM, migrations, local worker, tests
packages/media-engine/         Reserved reusable media/domain boundaries
packages/contracts/            Generated API types and contract documentation
docs/                          Plan, stack, UI directions, developer guides
.github/workflows/             Frontend/backend foundation checks
.codex/                        Development model profiles
~~~

apps/desktop/ is a historical scaffold superseded by the web decision. Reusable processing will move from the initial local worker to the media-engine package and hosted worker service as the pipeline grows.

## Development model configuration

| Task | Model | Reasoning | Profile |
| --- | --- | --- | --- |
| Lightweight | GPT-6 Luna (gpt-6-luna) | Low | smartclipper-light |
| Medium | GPT-6.1 Sol (gpt-6.1-sol) | Medium | smartclipper-medium |
| Architecture / high priority | GPT-6 Astra (gpt-6-astra) | High | smartclipper-high |

.codex/config.toml sets the repository default. Named configuration files live in .codex/. Install them in your Codex configuration directory before selecting a profile:

~~~powershell
$configDir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
Copy-Item .codex/smartclipper-*.config.toml -Destination $configDir
~~~

~~~sh
codex --profile smartclipper-light
codex --profile smartclipper-medium
codex --profile smartclipper-high
~~~

Choose the matching model in Codex app/IDE controls where supported. Profiles require a trusted project and can be overridden by explicit session selections. These configure the development assistant; they do not route production inference automatically.

## Token and runtime cost

Use the smallest suitable development model, focused file excerpts, and reusable findings. Reserve Astra for architecture/high priority. Native media extraction and quality checks run on workers. Cache transcripts/scene metadata; send relevant transcript chunks and a few frames for semantic analysis. Budget runtime tokens and retries independently of development profiles.
