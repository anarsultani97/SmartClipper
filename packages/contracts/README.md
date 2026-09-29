# Shared contracts

`schemas/` will contain versioned JSON Schemas for UI/shell/worker messages and data models. `examples/` will contain small valid message examples.

Plan for job IDs, command/request IDs, protocol versions, progress events, cancellation, typed errors, video metadata, transcript segments, excluded ranges, and clip plans. Use one documented time unit at the boundary (integer milliseconds) and half-open intervals [start, end). Adapters may preserve finer media time bases internally.

Use framed messages over worker stdin/stdout, with diagnostic logs on stderr. Never mix human log text into protocol output. The desktop shell owns worker lifetime; no local HTTP listener is needed for the initial architecture.

Schema generation and validation will be implemented before the first end-to-end feature. This directory currently contains no executable contract or schemas.
