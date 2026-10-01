# Link import and sound studio acceptance

Date: 2026-10-01. Local Windows development build. Unit suites and automatic CI remain skipped under the owner's current request; this is manual browser, real HTTP and native FFmpeg evidence.

| Area | Result |
| --- | --- |
| Public YouTube import | Pasted the official Ludwig video `https://www.youtube.com/watch?v=sCu8-aCSZbE` through the browser dialog. Queued download and preparation were visible. Final source is 1,474.955 seconds, 353,882,355 bytes, ready at 100%, with full source selection. Existing five-minute and Turkish projects remain available. |
| URL validation | HTTP rejected local HTTP URLs, suffix-spoofed hosts, playlists and URLs with credentials with 422. Canonicalization removes tracking queries. Other social platform extractors are configured but not verified against live representative videos in this change. |
| Audio uploads | Real HTTP accepted owned music WAV and an Opus WebM recording without a duration header. Decoded recording duration was 2.000 seconds. Invalid audio returned 422. |
| Ownership | A separate guest workspace could not fetch the development account's short/audio (404); the owning account could (200). |
| Apply | Music/voice IDs, levels and offsets persisted. Stale edits returned 409; a voice start at the short's end returned 422. |
| Native mix | Source muted, music at 20%, voice at 80% starting at 1 second. Decoded tone amplitudes: music 0.03866; voice before its start approximately 0; voice during its intended interval 0.18508. This checks actual encoded audio rather than a selected dropdown alone. |
| Downloaded export | Real queued export and download produced a 5.000-second MP4 with both selected music and delayed voice audible. |
| Original music beds | All six music previews were served. All six exported with non-silent audio (RMS 0.0131–0.0150 with source muted). No chart/trending claim is made. |
| Browser music preview | Selected Lo-fi music, applied it, adjusted level using keyboard controls and played the short. Video and added audio were simultaneously playing on the shared elapsed clock. Restored the user's previous Pulse selection and 16% level afterward. |
| Recording UI | Record, review/use-take, upload-voice and offset controls are present. A real user's microphone was not accessed during acceptance. Actual microphone permission/device behavior still needs user review; the no-duration WebM upload/export path was checked natively. |

Ignored local evidence: `.cache/link-audio-acceptance/report.json`, synthetic fixtures, downloaded MP4 and screenshots. Development account credentials and media are not committed. Browser inspection used the user's Windows Chrome viewport; no macOS/Safari or production-load claim is made.

Architecture and music-provider integration plan: [ADR 0006](../architecture/0006-link-import-audio-studio.md).
