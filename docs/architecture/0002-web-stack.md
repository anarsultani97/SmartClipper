# ADR 0002: Web application and server processing

Date: 2026-09-30
Status: Accepted product direction; implementation is incremental.
Supersedes: [ADR 0001](0001-desktop-stack.md).

## Decision

Build React/TypeScript in the browser and a Python FastAPI API. Execute FFmpeg, speech recognition, quality detection, and context analysis on server workers. Use PostgreSQL for hosted persistent state, private object storage for media, and Celery/Redis for dispatch. Retain reusable Python domain/media boundaries.

The first local review slice may use SQLite and local files to deliver UI/import quickly. It must be labeled a local prototype, with hosted ownership, queues, storage, and limits tracked before deployment.

## Reasons

Users can open a URL without installing an app or managing media dependencies. Python and React fit the team's skills; native media tools provide processing speed. Separate workers keep requests responsive and jobs alive after browser closure.

## Consequences

The service now owns upload reliability, compute/storage cost, privacy/retention, authorization, job recovery, and secure file processing. Upload latency depends on users' connections. The browser needs compatible proxies and temporary authorized media access. Initial deployment uses a small number of services; custom native extensions and orchestration platforms require measured justification.

Tauri/Rust shell, desktop IPC, SQLite as hosted authority, installer/signing, and local-only media processing are superseded. Preserve ADR 0001 as history and retire its scaffold when runnable web scaffolding is introduced.

## Implementation

Follow the [technology stack](tech-stack.md) and [step-by-step plan](initial-implementation-plan.md). Social publishing follows reliable downloads.
