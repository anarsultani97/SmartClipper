# Desktop application

Planned stack: Tauri 2, React, TypeScript, and Vite.

- `src/app/`: application composition, navigation, and providers.
- `src/features/library/`: source-video import and project library.
- `src/features/editor/`: candidate shorts, timeline, and preview.
- `src/features/exports/`: export jobs and progress.
- `src/shared/`: reusable UI and client utilities; keep feature-specific code inside its feature.
- `src/assets/`: source-controlled UI images and styles.
- `src-tauri/src/`: thin Rust shell for validated commands and worker lifecycle.
- `src-tauri/capabilities/`: least-privilege Tauri permissions.
- `src-tauri/binaries/`: generated platform-specific sidecars.
- `src-tauri/resources/`: distributable resource files.

Keep long media and inference work outside the UI event loop. The Rust shell launches and supervises the Python worker and validates messages against the contracts package. Avoid exposing generic shell execution to the frontend.

This is a folder scaffold. The frontend package manifest, Rust manifest, Tauri configuration, and runnable entry points will be added with the first desktop implementation.
