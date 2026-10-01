# Guided shorts beta acceptance

Date: 2026-10-01. Run locally on Windows with Node 24 and uv-managed Python 3.12.14. This records local measurements, not a hosted performance guarantee.

## Real podcast processing

Two private 180-second excerpts, starting at 04:00, were fetched from the FLOSS Weekly CDN solely for local acceptance. No third-party source video, transcript, cover or generated MP4 is committed.

| Source | Suggestions | Clear covers per suggestion | Preparation, recognition, generation and first export | Export |
| --- | --- | --- | --- | --- |
| [FLOSS 761 source](https://cdn.twit.tv/video/floss/floss0761/floss0761_h264m_1920x1080.mp4) | 5 | 3 for all 5 | 79.50 seconds | 1,848,487 bytes |
| [FLOSS 760 source](https://cdn.twit.tv/video/floss/floss0760/floss0760_h264m_1920x1080.mp4) | 4 | 3 for all 4 | 74.85 seconds | 2,457,372 bytes |

Processing used local multilingual Whisper `base`, CPU int8, and transcript-based ranking; hosted AI was disabled. The model was already downloaded. These times exclude the internet download itself and do not measure full-length uploads. Fewer than five valid suggestions is an expected quality/context outcome.

Ten local dashboard requests took a **median 6.53 ms**, including HTTP handling, authentication and database aggregation. This small dataset is not a large-scale concurrency benchmark. The dashboard has no continuous polling or external tracker.

Ignored `.cache/podcast-generation-smoke.json` contains raw result IDs/timings; `.cache/review-account.json` contains the local isolated review login and must remain private. Browser acceptance uses this account to check playback, caption save/reload, cover text/style/JPG download and mobile overflow. No account credentials are printed by the tools.

## Automated validation

Python tests cover authentication/session expiry/CSRF, owner isolation for every media/job route, safe SRT parsing, bounded multilingual caption strings, local/hosted ranking boundaries, quality thresholds, immutable export revisions, thumbnail sanitization, failed/partial jobs and operator dashboard authorization. Native generated media tests check 720×1280 MP4 output/duration, covers, captions/music rendering and byte ranges.

Frontend tests cover the one guided direction, language/translation preferences, imports, generation navigation, disabled OAuth configuration, signup, subtitle toggles, saved/stale revisions, covers and current export links. Browser journeys check responsive upload, import navigation, results and cover navigation, and personal dashboard permissions. CI results should be read for the exact PR head.

## Compatibility findings

The existing Conda 3.10 runtime crashed during CTranslate2 model loading. Clean uv-managed CPython 3.12.14 loaded the latest CTranslate2 4.8.2 and completed real recognition. PyAV 19 removed an option used by the Whisper file decoder; passing prepared mono PCM16 WAV as a NumPy array avoids that redundant decoding path. No obsolete CTranslate2 pin remains.

## Remaining acceptance gates

Real Google/Facebook consent requires registered client credentials; tests cover state/PKCE and rejected callbacks without pretending to validate live providers. Optional hosted ranking requires configured access and is tested with mocked responses only. Native-speaker recognition/translation and rendered glyph review for each supported language, Safari/macOS journeys, original-source-quality export, robust scene/framing analysis, retention/quotas and hosted load/security acceptance remain next steps.

Queue acceptance covers authenticated removal, cancellation during native preparation, non-resurrection, mobile visibility, reduced motion and empty-state feedback. Upload boundary and 2.7 GB database metadata tests validate the 3 GB cap; a full 3 GB network transfer has not been benchmarked. Turkish is selectable and Unicode captions are covered; native-speaker Turkish recognition acceptance remains pending.

## Guest and email acceptance follow-up

A real localhost browser journey passed with the API and worker running: main-page entry without onboarding, private guest import, SRT-based generation, editing preview, sign-in at download, email signup with uppercase address normalization, guest-project transfer, MP4 rendering/download, sign-out back to the main page, wrong-password feedback, correct email sign-in and persistence after reload. The test uses a generated 20-second video and writes any acceptance credentials only to ignored `.cache`.

The previous background Vite launcher ran from the repository root without loading the app configuration; `/api/v1/health` returned HTML. Restarting through the workspace `npm run dev` command restores the API proxy and self-hosted fonts. API JSON errors now report service availability or field validation instead of raw parse errors. A separate defect hid ready exports when polling changed only `export_revision`; edit detection now compares editable fields, and a regression test verifies the download stays visible.

Guest/OAuth ownership tests cover CSRF claims, wrong credentials, export gates, independent guest isolation, revoked guest sessions, safe return paths and a mocked verified Google exchange preserving localhost/project ownership. Real Google consent remains pending registered credentials; [setup instructions](google-sign-in.md) specify both local callback hosts.

Independent review identified and resolved three guest edge cases: cover draft loss at sign-in, old account visibility if post-logout guest setup fails, and a streamed upload completing after its guest was claimed. A threaded paused-stream regression verifies the resulting project belongs to the new account; frontend regressions cover immediate logout clearing and save-before-sign-in for covers.
