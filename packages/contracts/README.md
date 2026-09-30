# Shared contracts

`openapi.json` contains the generated initial HTTP contract. Frontend types live in `apps/web/src/generated/api.d.ts`. Regenerate both after API schema changes; see docs/development/local-development.md. The historical `schemas/` and `examples/` placeholders are reserved for later worker/domain contracts.

Plan for job IDs, command/request IDs, protocol versions, progress events, cancellation, typed errors, video metadata, transcript segments, excluded ranges, and clip plans. Use one documented time unit at the boundary (integer milliseconds) and half-open intervals [start, end). Adapters may preserve finer media time bases internally.

The web architecture uses FastAPI OpenAPI for HTTP contracts and generated frontend types. Worker job schemas should reference stable project/source/revision IDs. The former desktop framed IPC protocol is superseded; see docs/architecture/0002-web-stack.md.

The initial project/import/selection/media endpoints are implemented. Full hosted processing-job, transcript, excluded-range, and clip-plan contracts arrive with their respective milestones.
