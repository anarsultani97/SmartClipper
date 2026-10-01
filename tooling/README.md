# Web beta tooling

- `export-openapi.py`: exports the versioned API schema used to generate frontend contract types.
- `capture-review.mjs`: captures the guided/sign-in/mobile/activity UI; deterministic fixture data is labeled.
- `test-podcast-imports.py`: opt-in private network acceptance for two 180-second podcast excerpts, actual speech recognition, suggestions, covers, exports and dashboard latency.
- `check-live-review.mjs`: checks real browser playback, caption persistence, cover editing/download and responsive results using the ignored smoke account/evidence.

Run these from the repository root. Internet/model downloads do not run as part of unit tests. Private media, accounts, logs and acceptance evidence live in ignored `.cache/` and `data/`. Do not commit them. npm/uv lockfiles pin the web/API toolchain.

The GitHub workflow checks frontend/backend formatting and tests, native FFmpeg processing, migrations and Playwright. Hosted infrastructure and browser acceptance on macOS/Safari remain later milestones.
