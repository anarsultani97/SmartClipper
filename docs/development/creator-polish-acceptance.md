# Creator polish acceptance — 1 October 2026

Local Windows measurements, Python 3.12.14, Node 24.15, FFmpeg and CPU int8 ASR. Hosted ranking disabled. No third-party video, private Turkish transcript, account credentials or database is committed.

## Checks completed

- TypeScript type check and production Vite build: passed. JavaScript bundle ~87.6 KB gzip; no browser vision dependency added.
- Ruff, formatting, Python compilation and `git diff --check`: passed.
- Alembic upgrade to `0007`: applied to the existing local database. Ready rows migrate to 100%; style defaults preserve older shorts.
- `tooling/check-guest-auth.mjs`: real guest import, generation, signup/workspace transfer, captioned MP4 download, sign-out, incorrect-password feedback and persistent email sign-in passed.
- `tooling/check-creator-polish.mjs`: real throttled upload ring, generation progress, speech-based word highlighting, style/position persistence, transcript correction, subtitle re-enable, prominent source/library return buttons, 390 px mobile overflow check and zero browser exceptions passed. The final runtime rerun passed with the first short from a 30-second public excerpt after **9.16 seconds**. This one-clip measurement includes fast-mode ASR and generation but excludes upload/preparation. Ignored screenshots and raw timings are under `.cache/creator-*`.
- Native 30-second MP3/proxy import in one FFmpeg source pass: passed; produced valid MP3 and mono PCM16 speech audio.
- Native ASS export: rendered actual aligned captions at 720×1280; inspected an extracted frame with active lime word color.
- Native Windows FFmpeg progress: observed decoded times 1.05, 1.56, 2.05, 2.59, 3.10 and 3.63 seconds before the four-second process completed. This verifies live pipe progress rather than a timer animation.
- Balanced multilingual speech smoke: 30-second English excerpt produced 77 aligned words; a 30-second Turkish excerpt produced 9 aligned words across its audible speech. Turkish processing took **4.72 seconds** in that sample; it contains substantial nonspeech. No human reference transcription or word-error-rate claim is made.

The owner requested skipping unit testing for this change. No unit suites are added or run. `[skip ci]` on feature and merge commits prevents the existing automatic workflow from executing unit suites. Workflow defaults stay intact. Independent PR review checks the exact commit before merging to dev.

## Cached generation comparison

`tooling/benchmark-generation.py` runs dev baseline `3d3ab0e` and the updated implementation on the **same 180-second FLOSS Weekly excerpt and identical cached transcript**, in separate ignored databases. The final measurement ran without concurrent browser/media checks.

| Stage | Before | After |
| --- | ---: | ---: |
| Complete four-short generation | 43.758 s | 16.915 s |
| First playable result | 43.758 s | 6.599 s |

That is **61.3% less elapsed time** for this cached generation stage and **84.9% less waiting for the first playable short**. Both runs selected four excerpts. These exclude upload, source preparation, speech inference, optional hosted ranking and final HD export; larger accuracy models can add inference time. They are not a universal whole-video performance guarantee. The updated preview is intentionally lighter; final export retains HD resolution.

A separate 45-second native preview/cover measurement was 11.579 s before and 6.038 s after. New face-aware cover detection adds work; the main speed saving is the lighter preview and bounded parallel remainder. Model download/cache state and hardware affect results.

## Remaining review points

Review covers and transcript against your own videos. Face detection cannot identify a guest by name, determine the main game protagonist or guarantee the active speaker. The whole-scene/gameplay controls and manual cover editor address those cases. Beep detection can confuse narrow-band game sounds; deleted speech cannot be recovered. Edited/uploaded lines have estimated phrase timing, not fabricated word timing. Translation alignment, fonts for all supported scripts, overlapping speakers and full-length upload load tests need more multilingual acceptance before production.

Regenerate older suggestions to get the new selection/composition pipeline; existing user covers and edited shorts are preserved. Provider credentials, social publishing and production deployment remain separate work.
