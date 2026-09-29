# SmartClipper

SmartClipper is a planned desktop app for **Windows and macOS** that turns a longer video into **4-5 context-aware shorts** and extracts audio from MP4 files.

## Product goals

- Import an MP4 video and extract its audio as a separate file.
- Understand the video's context using a timestamped transcript and selected visual information.
- Identify 4-5 distinct, engaging moments that preserve the speaker's meaning and form coherent shorts.
- Detect and exclude blurry, black, corrupted, undecodable, or visually undetectable/unusable scenes from the generated shorts.
- Keep cuts aligned with speech and scene boundaries; maintain audio/video synchronization.
- Preview and export the shorts from a Windows or macOS desktop app.

Target 4-5 shorts per video when enough usable content exists. If quality filtering leaves too little material, report the limitation and produce fewer good shorts instead of filling the quota with bad scenes. Keep the source video intact.

## Planned processing flow

1. Inspect the video and extract audio locally.
2. Produce a timestamped transcript and detect scene boundaries.
3. Mark unusable time ranges using blur, black-frame, decoding, and visual-usability checks.
4. Analyze context and rank candidate highlights using the transcript and a small set of representative frames.
5. Select 4-5 distinct shorts, remove unusable ranges, and preserve coherent speech.
6. Let the user preview the results, then export shorts and extracted audio.

The planned stack is **Tauri 2 + React/TypeScript + a Python worker**, with **FFmpeg/ffprobe** handling native media operations. See [the architecture decision](docs/architecture/0001-desktop-stack.md) for boundaries and packaging tradeoffs. Transcription providers, clip duration, and export presets will be selected during implementation.
## Repository structure

```text
apps/desktop/                  React UI and Tauri desktop shell
  src/app/                     Application composition
  src/features/                Library, editor, and exports
  src/shared/                  Reusable UI and utilities
  src-tauri/                   Rust shell, capabilities, sidecar resources
packages/media-engine/         Python worker with a src package layout
  src/smartclipper_engine/     Domain, pipeline, adapters, and IPC
packages/contracts/            Versioned message schemas and examples
docs/architecture/             Design decisions
docs/development/              Team workflow
tooling/                       Development and packaging helpers
tests/                         Integration, desktop journeys, and fixtures
.github/                       Pull request template
.codex/                        Development model configurations
```

Each component has a README describing its responsibilities. Empty directories are retained with `.gitkeep` files. This is a structure scaffold; application manifests, dependency lockfiles, executable code, and CI workflows will arrive with implementation.

## Team branches

Use `main` for integration and pull requests from focused topic branches. Initial team branches are `feature/desktop-ui`, `feature/media-pipeline`, and `feature/ai-highlights`. See [team workflow](docs/development/team-workflow.md) before starting work.


## Development model configuration

| Task | Model | Reasoning | Examples |
| --- | --- | --- | --- |
| Lightweight (default) | GPT-6 Luna (`gpt-6-luna`) | Low | Small edits, documentation, extraction, simple fixes |
| Medium | GPT-6.1 Sol (`gpt-6.1-sol`) | Medium | Feature implementation, integrations, ordinary debugging |
| High priority or architecture | GPT-6 Astra (`gpt-6-astra`) | High | Architecture, critical issues, difficult cross-platform design |

The repository's `.codex/config.toml` sets Luna as its default. Named profile files are in `.codex/`. To install them for Codex CLI:

**Windows PowerShell**

```powershell
$configDir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
Copy-Item .codex/smartclipper-*.config.toml -Destination $configDir
```

**macOS**

```sh
mkdir -p "${CODEX_HOME:-$HOME/.codex}"
cp .codex/smartclipper-*.config.toml "${CODEX_HOME:-$HOME/.codex}/"
```

Run these commands from this repository:

```sh
codex --profile smartclipper-light
codex --profile smartclipper-medium
codex --profile smartclipper-high
```

Select the profile before starting the task. For the desktop app or IDE, choose the matching model and reasoning level in its model controls. Project configuration requires a trusted project; explicit session selections may override the repository default.

These profiles configure the development assistant. They do not implement automatic model routing or the future app's AI pipeline. The task-selection policy is recorded in `AGENTS.md`.

## Token usage policy

- Use Luna for clear, bounded work; use Sol for medium work; reserve Astra for high-priority and architecture work.
- Read relevant files and focused excerpts; avoid repeatedly loading the whole repository.
- Keep prompts, handoffs, and final outputs concise; reuse established context.
- For the future video pipeline, perform media extraction and basic quality checks locally, cache transcripts and scene metadata, and send only relevant transcript sections and representative frames for semantic analysis.
- Track token use per future AI stage; use explicit output budgets and bounded retries when the runtime pipeline is implemented.

## Current scope

The repository contains product documentation, a desktop/worker folder scaffold, team workflow, and development model configuration/policy. No runnable application is implemented yet.

Configuration references: [Codex profiles](https://learn.chatgpt.com/docs/config-file/config-advanced), [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference), and [model availability](https://learn.chatgpt.com/docs/models).
