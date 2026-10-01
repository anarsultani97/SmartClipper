# Web beta tooling

- `export-openapi.py`: exports the versioned API schema used to generate frontend contract types.
- `capture-review.mjs`: captures the guided/sign-in/mobile/activity UI; deterministic fixture data is labeled.
- `test-podcast-imports.py`: opt-in private network acceptance for two 180-second podcast excerpts, actual speech recognition, suggestions, covers, exports and dashboard latency.
- `check-live-review.mjs`: checks real browser playback, caption persistence, cover editing/download and responsive results using the ignored smoke account/evidence.

Run these from the repository root. Internet/model downloads do not run as part of unit tests. Private media, accounts, logs and acceptance evidence live in ignored `.cache/` and `data/`. Do not commit them. npm/uv lockfiles pin the web/API toolchain.

The GitHub workflow checks frontend/backend formatting and tests, native FFmpeg processing, migrations and Playwright. Hosted infrastructure and browser acceptance on macOS/Safari remain later milestones.

`node tooling/check-guest-auth.mjs` is an opt-in live browser/API/worker journey for guest generation, email authentication, ownership transfer and download. Start services with the documented workspace commands and provide ignored `.cache/guest-acceptance.mp4` (a generated 20-second video with audio). It uses an isolated random account and writes credentials only to ignored `.cache/guest-account-acceptance.json`; do not commit them. `SMARTCLIPPER_REVIEW_ORIGIN` selects the test origin (default localhost:5173). Confirm `/api/v1/health` returns JSON through that frontend origin before running.
