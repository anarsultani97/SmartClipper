# Local beta development

Date: 2026-10-01. The selected guided direction is the only UI.

## Setup

Use Node 24, uv, clean Python 3.12+, FFmpeg and ffprobe. Native speech loading crashed in the pre-existing Conda 3.10 environment during acceptance; a clean uv-managed CPython environment fixed it. From the repository root:

```sh
uv python install 3.12
uv sync --locked --managed-python
npm ci
uv run alembic upgrade head
```

On this Windows workspace, uv is also available at `.venv/Scripts/uv.exe`; prefix commands with `& .\.venv\Scripts\uv.exe` when needed. Copy `.env.example` to ignored `.env` only if that file does not exist already; preserve your configured native paths and secrets. Use forward slashes for Windows executable paths.

Start these in separate terminals:

```sh
uv run uvicorn smartclipper_api.app:app --host 127.0.0.1 --port 8000
uv run python -m smartclipper_api.worker
npm run dev
```

Open http://127.0.0.1:5173 to use the guest workspace. Sign in when downloading. The API docs are at http://127.0.0.1:8000/docs. One persistent worker is protected by an OS file lock. Stop it before running the standalone podcast acceptance script.

Import up to 3 GB/60 minutes, choose language/platform/length/count, wait for preparation and generate shorts. Upload a timed SRT in its actual language to skip speech recognition. Local model weights download once to ignored `data/models`. Generated exports are 720×1280 from the prepared proxy, with optional burned subtitles and original music beds. Styled cover downloads are separate JPEGs from the browser editor.

## Optional providers

Google: follow [Google sign-in setup](google-sign-in.md), register both localhost and 127.0.0.1 callbacks, and set `SMARTCLIPPER_GOOGLE_CLIENT_ID` and `SMARTCLIPPER_GOOGLE_CLIENT_SECRET` in `.env`.

Facebook: register your Meta app, enable Facebook Login, register `/api/v1/auth/facebook/callback` under the same public origin, configure client ID/secret and the Graph API version supported by that app. Meta app mode, roles and review requirements determine who can consent.

Restart the API after configuration. Provider buttons remain disabled without complete credentials. Never put secrets in frontend variables or Git. Live sign-in cannot be certified by mocked callback tests; perform real consent, cancellation, expiry and account-collision checks with your registered apps.

Hosted semantic ranking is optional and off by default. Configure `SMARTCLIPPER_HOSTED_RANKING_ENABLED=true`, API key and a compatible model available to your account. Enabling it sends bounded excerpt text to OpenAI. Local inference keeps transcripts/media on the local machine. Development Codex model profiles do not select production inference.

Install broad Noto font coverage on hosted workers (`fonts-noto-core` and `fonts-noto-cjk` on Ubuntu) before multilingual burned-caption acceptance. Check each script and translation with a fluent reviewer.

## Activity dashboard

Open **Activity dashboard** in the sidebar for personal all-time totals and daily requests from the last 30 days. Nothing loads continuously while another page is open. It does not track playback, downloads, click streams or social shares.

For operator aggregates, sign in with an existing account, copy its ID shown at the bottom of the personal dashboard and add it to `SMARTCLIPPER_ANALYTICS_ADMIN_USER_IDS=["your-existing-uuid"]` in `.env`. Restart the API. Only allowlisted authenticated account IDs can view the all-users tab. Do not grant access by email; email verification is not implemented yet.

## Migrations and legacy files

Run Alembic explicitly; application startup never uses `create_all`. Tests use isolated temporary databases. The ownership migration leaves historical projects with a null owner, inaccessible to all new accounts. If those files should be retained, make a database backup and explicitly assign each legacy project to the intended known user offline.

Media, model weights, `.env`, SQLite data, smoke credentials and logs remain ignored. Retention is manual in this beta. The single-machine deployment still needs hosted storage/queues, quotas, deletion, verified email/recovery and load testing before public release. See [the current architecture](../architecture/0003-short-generation.md).

## Validation and generated contracts

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest
npm test
npm run format:check
npm run build
npm exec --workspace @smartclipper/web -- playwright install chromium
npm run test:e2e
```

Native tests generate media locally; CI installs FFmpeg and runs them. No model downloads, paid inference, OAuth consent or internet podcast fetches run in unit tests.

After changing API schemas:

```sh
uv run python tooling/export-openapi.py
npm exec --workspace @smartclipper/web -- openapi-typescript ../../packages/contracts/openapi.json -o src/generated/api.d.ts
npm run format
```

Opt-in podcast acceptance (API/frontend running, persistent worker stopped):

```sh
uv run python -u tooling/test-podcast-imports.py
node tooling/check-live-review.mjs
```

It privately downloads two 180-second FLOSS Weekly excerpts, signs into an isolated review account, performs actual local speech recognition, generates up to five clips, checks thumbnails/byte ranges and renders exports. Evidence goes to ignored `.cache/podcast-generation-smoke.json`; credentials stay in ignored `.cache/review-account.json` and are never printed. Source URLs/rights can change; do not redistribute third-party media.

`node tooling/capture-review.mjs` produces deterministic guided/sign-in/mobile/activity UI screenshots for documentation. Mocked screenshot data is labeled as a UI fixture, separate from the actual media acceptance run.

The main page opens as a private guest workspace. Registration/sign-in is requested for downloads; existing guest projects move into the account after successful authentication. Guest cookies expire after 24 hours, so sign in to keep access. Google and Facebook appear on the account page and become enabled when their actual credentials are configured. Use [the local setup helper](social-sign-in.md#local-credential-helper).

Generated shorts appear individually as soon as playable previews finish. The shorts page shows the actual batch count and offers an optional reaction game during processing. See [the progressive experience](../architecture/0007-progressive-shorts-experience.md) and [the hosted beta cost plan](../architecture/hosting-cost-plan.md).
