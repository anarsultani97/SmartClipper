# SmartClipper model selection policy

Use the smallest model suitable for each task, following the owner's choices:

- Lightweight tasks: `gpt-6-luna`, low reasoning (`smartclipper-light`).
- Medium tasks: `gpt-6.1-sol`, medium reasoning (`smartclipper-medium`).
- High-priority tasks and architecture: `gpt-6-astra`, high reasoning (`smartclipper-high`).

Classify the task before work. Explicit high priority and architecture take precedence over task size. Select the corresponding profile/model when the host supports selection. These instructions do not themselves switch the active model; do not claim a switch that did not occur. Do not silently substitute another model if the requested model is unavailable.

Keep context and responses concise. Search before reading, use focused excerpts, and reuse existing findings. Raise reasoning effort only when the task needs it. Avoid unnecessary parallel agents, repeated analysis, and duplicate outputs.

The current product is a web application. Follow docs/architecture/0002-web-stack.md, docs/architecture/tech-stack.md, and docs/architecture/initial-implementation-plan.md. The owner selected the guided UI only and authorized generated shorts, multilingual/English captions, authentication, quality checks, covers, downloads, aggregate activity analytics and unit tests. Do not fabricate testimonials, trend rankings, virality scores or live provider verification. Keep hosted production, social publishing and future editor features distinct. The owner requests a PR into dev, another agent's review, and merge only after review and tests pass. Follow docs/development/team-workflow.md for branches.

The owner now requires the main page to open without onboarding. Use a private guest workspace for import, generation and editing; defer account signup/sign-in to downloads and future social connections. Prioritize Google as the visible OAuth option and preserve guest work on successful authentication.
