# ADR 0005: Reversible editing and a timeline-ordered shorts feed

Date: 2026-10-01. Status: implemented for local review.

## User workflow

1. Import a video and open its workspace. Expand **Edit original video** to trim the analysis range, adjust picture/audio, or open Advanced for speed, rotation, mirroring and fades.
2. **Apply changes** persists the source selection and adjustments. Generate shorts applies pending valid edits first, then snapshots those settings into an immutable generation job.
3. Review all suggested shorts as separate cards, ordered by their original timestamps. Each has a numbered title, duration, preview, cover choices and an **Edit short** button.
4. Choose **Vertical (9:16)** or **Full horizontal (16:9)**. Vertical defaults to preserving the whole scene with black padding. Advanced offers an explicit centre crop. Horizontal always keeps the whole scene.
5. Edit a short's trim, brightness, contrast, colour, volume, speed, rotation, mirror, fades, captions, title and cover. Preview changes locally, then **Apply changes**. Discard restores the saved version; Reset restores media settings.
6. Sign in only when downloading. A render snapshots the saved settings and caption track; later edits invalidate the current export revision. Cover editing applies valid pending short edits before navigation.

## Data and media clocks

- Migration `0008` adds a bounded JSON `video_edits` object to projects and shorts. Pydantic rejects unsupported options, non-finite numbers and out-of-range values. Existing rows use neutral defaults.
- Project `start_ms`/`end_ms` remain source-clock selection bounds. Source adjustments do not rewrite uploads, proxy audio or transcription caches.
- Short `start_ms`/`end_ms` remain immutable suggestion bounds. Short trim offsets live inside `video_edits`, so repeated edits never accumulate timestamp drift or destroy the original captions.
- Source generation uses its saved selection and speed-adjusted duration preference. Shorts inherit the snapshotted picture/audio adjustments.
- Browser previews read the existing horizontal proxy and seek within the selected source interval. Caption word timestamps stay on their original short clock. Playback rate changes the display clock without estimating new word alignment.
- Export rebases caption/word times to the trimmed interval, then divides them by speed. FFmpeg trims before processing, applies validated transforms and bounded audio tempo, and renders ASS using the selected output dimensions.
- Optimistic revisions prevent stale clients from overwriting saved edits. Existing owner checks, CSRF, private media and guest download gates apply to editing.

## Keeping the interface and processing light

Only the selected card mounts a video and requests caption data. Other cards show lazy cover images. Editing controls mount on demand. Preview updates are bounded to 24 Hz; idle previews have no animation loop. No editor framework or new runtime dependency was added.

Preview uses browser colour filters and audio controls; FFmpeg produces the final media. Colour handling can vary slightly between browsers and encoders. Music beds remain export-only. Native output is 720×1280 vertically or 1280×720 horizontally; prepared source proxies limit effective detail.

This is a practical single-clip editor. Multi-track compositing, keyframes, arbitrary crop placement, audio denoising, undo history and original-resolution exports remain future work.

## References

- [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html): trim, setpts, transpose, eq, scale, pad, crop, atempo and fades.
- [Browser playback rate](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate): rate-controlled preview.
