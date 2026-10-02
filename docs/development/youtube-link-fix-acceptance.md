# YouTube link import fix — 2026-10-02

## Reproduction and changes

Input: https://www.youtube.com/watch?v=7KuAUgDbxfw&list=PL970Mjbk0xsNgU0J__T66jU8ZtbFQeO1Y

The public video is approximately 45:34. The previous 30-minute cap caused yt-dlp's match filter to skip the video; the missing download was then reported as a generic unavailable-link error. Playlist parameters were already removed correctly.

- Default duration is now 60 minutes; the size cap remains 3 GiB (displayed as 3 GB).
- Health returns the configured duration and size. Import hints and file validation use these values; the backend remains authoritative.
- Controlled duration, live-video, unknown-duration and size rejections retain their specific safe messages. Unexpected extractor details remain private.
- Added Azerbaijani (`az`) to both language selectors and backend validation. Whisper includes Azerbaijani in its [official language list](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py). Language availability does not guarantee transcription accuracy.
- Unsupported detected languages fail before consuming the transcription segment iterator.
- Public destination checks, extractor restrictions, quotas, ownership and CSRF checks remain in place.

Existing installations with an explicit `SMARTCLIPPER_MAX_DURATION_SECONDS=1800` override must change it to `3600` and restart API and worker when their queues are idle. This workstation's override was updated. The UI displays custom limits from health.

## Real media acceptance

Retried the original failed project through the app; downloaded and prepared the full video, without browser cookies, substitute footage or a supplied transcript.

- Project: `d8f3c8ab-f479-4e6c-834a-2c7c4c49326c`.
- Generation: `f24f923d-b8fc-4d04-9764-d80c6ab79b19`.
- Prepared duration: 2733.545941 seconds. Source preview has H.264 video and AAC audio; extracted MP3 and mono speech WAV are present.
- Selected Azerbaijani, balanced local recognition (`small`), YouTube Shorts, up to five 45-second suggestions; English translation off.
- Produced 510 transcript cues and five finished shorts. Each has three recommended cover choices and original captions.

| Original interval (seconds) | Encoded clip duration |
| --- | --- |
| 66.390–110.790 | 44.417 s |
| 524.720–569.210 | 44.500 s |
| 1314.350–1358.490 | 44.140 s |
| 1935.820–1978.660 | 42.840 s |
| 2035.550–2080.540 | 45.000 s |

All five clip files passed complete FFmpeg decode and ffprobe duration/audio checks. The browser results page displays all five cards with covers and captions. Media and logs remain in ignored local storage.

Transcription is automatic and needs review, particularly names and noisy outdoor speech. This acceptance establishes import, full-video processing and playable output, not publish-ready caption accuracy, virality or provider login verification.

## Automated checks

- `pytest services/api/tests`: 91 passed, including native FFmpeg preview/export coverage.
- `npm test`: 30 passed.
- Ruff, Prettier, TypeScript/production build and `git diff --check`: passed.
- Added regressions for the exact playlist-bearing URL, 45:34 input under old/new caps, duration boundaries, invalid/live/oversized metadata, downloader rejection propagation, health limits, Azerbaijani support and early unsupported-language rejection.
- Updated older test fixtures for progressive completed clips, current editor controls, timed-word fields, ASR keyword arguments, invalid OAuth state errors, full source selection and 480×854 previews. The native test separately asserts 720×1280 exports.
