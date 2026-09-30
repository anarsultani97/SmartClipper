# Team workflow

Use one integration branch, `main`, with short-lived topic branches and pull requests.

## Initial branches

| Branch | Starting responsibility |
| --- | --- |
| `main` | Shared integration baseline |
| `feature/desktop-ui` | Historical desktop work; superseded by future `feature/web-ui` topics |
| `feature/initial-implementation-plan` | Current web plan, Figma review, and initial foundation |
| `feature/media-pipeline` | Python worker, media extraction, and quality filtering |
| `feature/ai-highlights` | Transcription/AI adapters and context-aware clip selection |

Assign one owner per active branch. Agree on API contracts before dependent UI/worker changes. Use focused topics such as `feature/web-ui`, `feature/upload-api`, and `feature/job-worker` for later parallel team work; those topic names are recommendations, not branches created by this update. Retain the current plan branch for the owner's initial review request.

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

Configure a main-branch ruleset requiring PR review, blocking force pushes/deletion, and requiring frontend/backend checks once workflows exist. Browser acceptance covers Windows Chrome/Edge and macOS Safari/Chrome; server processing targets Linux containers. An owner configures access/reviews. These settings and invitations are not applied by this documentation.

No CI checks are claimed yet. Establish formatting, type checks, focused tests, and platform build jobs when the corresponding application manifests and code are introduced.
