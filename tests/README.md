# Cross-component checks

- `integration/`: future UI/shell/worker protocol and media-pipeline checks.
- `e2e/`: future desktop import, preview, cancellation, and export journeys.
- `fixtures/`: future small synthetic or redistributable media with provenance.

Frontend unit checks should live near their features; engine unit checks belong in `packages/media-engine/tests/`.

Fixtures must cover black scenes, blur, malformed media, short input, and timestamps without depending on private user videos. Do not commit large videos, model weights, or generated exports. Add fixture license/source metadata when media is introduced.

These are reserved folders; no tests have been implemented or run for this structure-only commit.
