# ADR 0001: Desktop stack and processing boundaries

Date: 2026-09-30
Status: Superseded by [ADR 0002: Web application](0002-web-stack.md). Retained as historical context; do not use this decision for new implementation.

## Decision

Use a single repository with a Tauri 2 desktop application, React/TypeScript UI built with Vite, and a Python media-processing worker. Use FFmpeg/ffprobe for native media operations. Keep the Rust layer small and focused on desktop permissions, validated IPC, process supervision, and OS integration.

Plan pnpm for frontend dependencies and uv for Python environments. Add manifests, exact versions, and lockfiles during runnable application scaffolding.

## Rationale

This fits the team's Python and web experience. Tauri uses OS webviews: WebView2 on Windows and WKWebView on macOS. It supports bundling external executables, including packaged Python programs. The Python worker keeps media jobs off the UI thread and separates provider dependencies from presentation.

FFmpeg supplies decoding/encoding and black-scene/blur analysis. Python schedules this native work rather than implementing frame processing in Python loops. Introduce bespoke Rust or C++ modules only after profiling identifies an operation that existing native libraries cannot perform efficiently.

## Boundaries

React UI -> validated Tauri commands -> supervised Python worker -> native media tools and AI/transcription adapters.

Use a versioned, framed JSON protocol over worker pipes. Keep logs on stderr and bulk media on disk. No network server is needed for desktop IPC. Validate paths and arguments; invoke executables using argument arrays rather than building shell command strings.

The shell and worker must implement timeouts, progress, cancellation, crash recovery, and child-process cleanup. The UI should receive structured status rather than wait synchronously for video rendering.

## Distribution and unresolved details

Package workers and media binaries for Windows x64, macOS Apple Silicon, and macOS Intel as supported release targets. End users should not need to install Python or FFmpeg. Build and validate on each operating system.

System webviews differ; preview codecs and playback must be evaluated on both platforms. Python sidecars and media binaries can dominate installer size even when the shell is small. Measure memory, startup, and processing time in a real vertical slice before making performance claims.

Review the exact FFmpeg distribution/license before redistribution. Determine signing, notarization, worker bundling, update strategy, transcription providers, model availability, clip length, and output presets during implementation. Store runtime projects and caches in OS application-data locations and credentials through OS-backed storage.

## References

- [Tauri process model](https://v2.tauri.app/concept/process-model/)
- [Tauri sidecar packaging](https://v2.tauri.app/develop/sidecar/)
- [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html)
- [Python src layout with uv](https://docs.astral.sh/uv/concepts/projects/init/)
