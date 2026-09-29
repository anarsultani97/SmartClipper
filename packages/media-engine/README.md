# Media engine

Planned Python package: `smartclipper_engine`, using a `src/` layout and uv for environments and dependency locking.

- `domain/`: video metadata, time ranges, quality findings, and clip plans; no desktop or provider dependencies.
- `pipeline/`: job orchestration, progress, cancellation, and the ordered processing stages.
- `adapters/media/`: FFmpeg/ffprobe invocation and optional native image-analysis libraries.
- `adapters/transcription/`: timestamped transcript providers.
- `adapters/ai/`: context analysis and highlight-selection providers.
- `ipc/`: worker entry point and versioned message serialization.
- `tests/`: future engine unit checks.

Keep CPU-intensive operations in native media libraries or separate worker processes. Bound concurrency and avoid transferring full decoded frame buffers through desktop IPC. Cache reusable transcript and scene metadata in OS application-data directories.

The intended flow is inspect -> extract audio -> transcribe -> evaluate scenes -> select highlights -> render exports. Represent unusable scenes as explicit time ranges, preserve A/V synchronization, and allow fewer than 4-5 shorts when there is insufficient usable material.

The Python manifest and implementations will be added when engine development begins.
