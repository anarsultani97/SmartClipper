# Team workflow

Use one integration branch, `main`, with short-lived topic branches and pull requests.

## Initial branches

| Branch | Starting responsibility |
| --- | --- |
| `main` | Shared integration baseline |
| `feature/desktop-ui` | React UI and Tauri shell |
| `feature/media-pipeline` | Python worker, media extraction, and quality filtering |
| `feature/ai-highlights` | Transcription/AI adapters and context-aware clip selection |

All starter branches initially point at the same structure commit. Assign one owner per active branch. Agree on changes to `packages/contracts` before dependent UI and engine work. These branches are starting points, not permanent silos; replace them with specific topic branches as work is split.

## Daily work

1. Fetch current branches and start from the latest main:
   `git fetch origin`, `git switch main`, `git pull --ff-only`.
2. Create a topic branch such as `git switch -c feature/import-video`.
3. Keep changes focused, commit them, and push with `git push -u origin feature/import-video`.
4. Open a PR into `main`; include behavior, validation, and screenshots for UI changes.
5. Obtain peer review and resolve conflicts. Merge main into a shared branch rather than rewriting teammates' published commits.
6. Squash merge when appropriate, then delete the completed feature branch.

Use `feature/<task>`, `fix/<task>`, and `chore/<task>`. Create a temporary `release/<version>` only if a release needs stabilization alongside ongoing work.

## Repository settings to add when the team is ready

Configure a main-branch ruleset requiring PR review, blocking force pushes and deletion, and requiring Windows/macOS checks once build workflows exist. A repository owner must configure review ownership and give teammates access. These settings and invitations are not applied by this structure commit.

No CI checks are claimed yet. Establish formatting, type checks, focused tests, and platform build jobs when the corresponding application manifests and code are introduced.
