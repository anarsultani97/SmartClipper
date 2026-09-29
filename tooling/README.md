# Tooling

- `dev/`: future cross-platform environment and development helpers.
- `build/`: future frontend, worker-sidecar, and desktop packaging helpers.

Use Node-based tooling for frontend tasks and Python scripts for media/worker tasks when practical. Avoid assuming Bash on Windows or PowerShell on macOS. Pin tool versions and commit application lockfiles once manifests are added: pnpm lockfile, uv lockfile, and Cargo.lock.

Windows packages and macOS signed/notarized packages need their own platform build jobs. Keep signing secrets in CI secrets or OS credential stores. No build scripts or workflows exist yet.
