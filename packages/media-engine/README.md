# Media engine

Planned Python package: `smartclipper_engine`, using a `src/` layout and uv for environments and dependency locking.

- `domain/`: video metadata, time ranges, quality findings, and clip plans; no desktop or provider dependencies.
- `pipeline/`: job orchestration, progress, cancellation, and the ordered processing stages.
- `adapters/media/`: FFmpeg/ffprobe invocation and optional native image-analysis libraries.
- `adapters/transcription/`: timestamped transcript providers.
- `adapters/ai/`: context analysis and highlight-selection providers.
- `ipc/`: worker entry point and versioned message serialization.
- `tests/`: future engine unit checks.

Keep CPU-intensive operations in native media libraries or separate worker processes. The web API and independent worker replace desktop IPC; cache artifacts in private server storage. Retire `ipc/` as web scaffolding is introduced. Reusable domain/pipeline/adapters remain independent of FastAPI and Celery.

The intended flow is inspect -> extract audio -> transcribe -> evaluate scenes -> select highlights -> render exports. Represent unusable scenes as explicit time ranges, preserve A/V synchronization, and allow fewer than 4-5 shorts when there is insufficient usable material.

The Python manifest and implementations will be added when engine development begins.
