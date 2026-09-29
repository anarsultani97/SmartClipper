# SmartClipper model selection policy

Use the smallest model suitable for each task, following the owner's choices:

- Lightweight tasks: `gpt-6-luna`, low reasoning (`smartclipper-light`).
- Medium tasks: `gpt-6.1-sol`, medium reasoning (`smartclipper-medium`).
- High-priority tasks and architecture: `gpt-6-astra`, high reasoning (`smartclipper-high`).

Classify the task before work. Explicit high priority and architecture take precedence over task size. Select the corresponding profile/model when the host supports selection. These instructions do not themselves switch the active model; do not claim a switch that did not occur. Do not silently substitute another model if the requested model is unavailable.

Keep context and responses concise. Search before reading, use focused excerpts, and reuse existing findings. Raise reasoning effort only when the task needs it. Avoid unnecessary parallel agents, repeated analysis, and duplicate outputs.

The initial scope is README and model configuration only. Add application code only when requested.
