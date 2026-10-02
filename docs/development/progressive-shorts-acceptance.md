# Progressive shorts review

Date: **2026-10-02**, Windows, local CPU worker, native FFmpeg. Unit suites were skipped as requested. No production hosting or live provider consent is claimed.

## Native media and owned HTTP responses

A separate SQLite database used the existing five-minute public Ludwig excerpt and its cached timed transcript. The real context/quality selection, thumbnail selection and FFmpeg rendering code ran; no simulated clips, artificial delays or speech-model timing were included.

| Observation                       | Result                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------- |
| First published playable short    | 9.971 seconds; job still `processing`, 1 of 4 candidates published           |
| All four shorts finished          | 18.128 seconds                                                               |
| Files at publication              | FFprobe found video and audio streams in each published preview              |
| Actual candidate count            | `planned_count = 4`; final `ready_count = 4`                                 |
| Explicit queued batch             | Empty, with no previous-generation clips mixed in                            |
| Job ID from another project       | 404                                                                          |
| Another workspace owner           | 404 for jobs and shorts                                                      |
| New batch after a completed batch | Explicit new batch empty; default API still returns previous completed clips |

These are single-run local observations, not a throughput guarantee or a full-transcription benchmark. The active browser polling adds request/refresh latency to worker publication. The source selection and quality gates were retained.

Evidence stays ignored in `.cache/progressive-native-report.json` and `.cache/progressive-native/`. No customer files or credentials are included in this document.

## Browser review

- Chrome showed **1 of 4 shorts ready** and the first playable card while the remaining cards were still processing on the existing 24:34 public Ludwig import. A later run showed 1 of 5 with the optional game open.
- The reaction game showed correct early-click feedback and accepted Enter/Space for a successful round, recording a session score. An opened game remained after batch completion, showed the updated completion message, accepted another round, and disappeared after Close. It is opt-in and uses no continuous render loop.
- Preview playback advanced from source time 248.577 to 274.397 seconds across ordinary polling, rather than restarting at each refresh.
- Rendered text checks found faint format, source-range and picture-adjustment labels; these were corrected in the theme. The inspected results/editor surfaces were reviewed separately from text on video images. This is a focused contrast review, not full WCAG certification.
- Brief button/arrival motion and the reduced-motion CSS override are implemented. Actual operating-system reduced-motion emulation was not performed.
- Browser file-upload automation timed out before producing a chooser. Extension file-URL access needs to be enabled to run that automation; this review used existing imported media and separately verified the native generation pipeline.

Screenshots are kept locally in `.cache/clivvy-first-short.jpg`, `.cache/clivvy-progressive-game.jpg` and `.cache/clivvy-results.jpg`. The original five-minute project's edited clips were preserved; review generations used the separate full-video import.

## Authentication and configuration

After backend changes, **34 manual isolated HTTP/OAuth callback checks passed**. They cover email signup/login, duplicate-email and password errors, guest-work preservation, CSRF, provider cancellation/missing email, account collision, and Authlib state/JWT validation with controlled provider responses. This is not real Google/Meta consent.

Chrome also displayed **Incorrect password. Please try again.** for a deliberately incorrect password against an existing review account. No successful sign-in claimed the user's current guest workspace during this browser check.

`tooling/configure-social-auth.py --check` confirms the actual local Google and Facebook credentials are absent. The helper's write behavior was checked against an isolated temporary `.env`: quoted/backslash values round-trip, unrelated settings/comments survive, duplicate keys are removed, and temporary files are cleaned. The real `.env` was not modified by this check.

The owner must supply Google Web application and Meta Facebook Login registrations using [social sign-in setup](social-sign-in.md). After API restart, verify real consent, cancellation, first-time creation, repeat sign-in and preserved guest videos with provider test accounts. Fake credentials are not a valid substitute.

## Static validation

- Frontend TypeScript and production Vite build: passed.
- Repository Prettier check: passed.
- Python Ruff lint and formatting for API and the setup helper: passed.
- OpenAPI and generated frontend contracts refreshed.
- The optional game chunk is approximately **0.99 KB gzip**, loaded only when opened; no new animation or game runtime dependency was added.
