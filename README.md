# SmartClipper

A web application for turning videos into up to five transcript-based shorts, with captions, clear cover choices and MP3 extraction. Users import, review, customize and download. Social publishing comes later.

## Current review build

Implemented beta: the selected guided UI, account-owned MP4 imports, large video/timeline preview, SQLite migrations, a separate durable worker, local multilingual transcription or timed SRT upload, English translation, visual quality sampling, short generation, original instrumental music beds, captions, vertical MP4 export and a dedicated thumbnail editor.

The activity dashboard reads existing database aggregates on demand. Personal activity is available to each user; operator access requires an allowlist of authenticated user IDs. No tracking scripts or session replay are added.

Creator improvements: upload/generation progress rings, playable results as each short finishes, prominent **View shorts** links, local face-aware cover recommendations with people/gameplay/whole-scene framing, multilingual speech accuracy controls, styled word-highlight captions and transcript corrections. Smaller previews speed review; saved captions burn into HD downloads. See [quality research and speed design](docs/architecture/0004-creator-quality-and-speed.md) and [acceptance measurements](docs/development/creator-polish-acceptance.md). Beeps and missing audio require review; the app does not guess censored words.

This is a **local-storage beta**, with account isolation. Google sign-in needs registered provider credentials; see [setup](docs/development/google-sign-in.md). Facebook remains a later UI option. Local clip scoring is a transparent transcript heuristic; optional hosted semantic ranking needs explicit configuration. No instant-processing or virality promise is made. Production storage/queues, email verification/recovery, retention and load testing remain release gates.

## Start locally

Requirements: Node.js 24, a clean Python 3.12+ environment, uv, FFmpeg and ffprobe. Run from the repository root. Prefer `uv python install 3.12` and `uv sync --managed-python` if an existing Conda environment conflicts with native speech libraries.

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

Open http://127.0.0.1:5173 to enter the main workspace directly. Import, generate and edit as a guest; sign in when downloading. Only the guided direction remains. The API docs are at http://127.0.0.1:8000/docs.

Import an MP4 (up to 3 GB / 30 minutes), choose language/platform/length, wait for preparation and generate shorts. First use downloads the local speech model. Review each short, toggle captions, select music/cover and render a download. Current exports are 720×1280 and reuse the prepared proxy. One persistent worker is protected by a file lock; interrupted work becomes failed/retryable. Older ownerless projects require explicit operator assignment.

## Validation

~~~sh
npm test
npm run build
uv run pytest
uv run ruff check .
npm exec --workspace @smartclipper/web -- playwright install chromium
npm run test:e2e
~~~

See [local development](docs/development/local-development.md), [guided UI review](docs/design/ui-directions.md), and [generation architecture](docs/architecture/0003-short-generation.md) for setup, limitations and acceptance evidence.

## Architecture and milestones

- [Step-by-step web workflow and milestones](docs/architecture/initial-implementation-plan.md)
- [Technology stack](docs/architecture/tech-stack.md)
- [Web architecture decision](docs/architecture/0002-web-stack.md)
- [Generation, authentication, covers and activity dashboard](docs/architecture/0003-short-generation.md)
- [Creator quality, caption research and faster first results](docs/architecture/0004-creator-quality-and-speed.md)
- [Team branches and workflow](docs/development/team-workflow.md)

Hosted direction: React + FastAPI + PostgreSQL + private object storage + independent Python workers. FFmpeg performs native media operations; faster-whisper supplies transcription through an adapter. Context selection uses bounded transcript analysis and sparse frames. Keep the source intact and return fewer than five shorts when quality/context cannot support five.

## Codebase

~~~text
apps/web/                      React UI, unit tests, browser tests
services/api/                  FastAPI, ORM, migrations, local worker, tests
packages/media-engine/         Reserved reusable media/domain boundaries
packages/contracts/            Generated API types and contract documentation
docs/                          Plan, stack, guided UI review, developer guides
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
