# SmartClipper local API and worker

FastAPI, SQLAlchemy, Alembic, SQLite. See [local development](../../docs/development/local-development.md).

Run migrations before starting the API. Imports stream to UUID-owned local folders and queue persisted project rows. A separate single worker claims queued rows and runs bounded ffprobe/FFmpeg preparation. Only ready projects expose known media assets. Edits validate duration and optimistic revisions.

The review build binds to localhost and is single-user. Hosted identity/tenant ownership, PostgreSQL, object storage, durable queue/leases, cancellation, and retention are later milestones. Reusable processing will move into packages/media-engine as it grows.

Tests use isolated temporary databases/media. Native checks require FFmpeg/ffprobe; no internet access is required for unit tests.
