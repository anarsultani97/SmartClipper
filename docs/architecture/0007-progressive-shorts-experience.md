# Progressive shorts and a lighter waiting experience

Status: implemented locally, 2026-10-02. Product name remains provisionally Clivvy.

## 1. Publish complete shorts individually

The worker renders the first selected candidate before the remaining candidates. It commits each short only after its playable preview and cover-selection work finish. Context selection, scene quality checks, transcript handling and rendering stay in the pipeline. The UI never substitutes an incomplete render or a random excerpt to appear faster.

The generation job records `planned_count` after selection. The requested number is an upper bound: fewer clean, meaningful candidates can be returned. Jobs expose `ready_count`; the shorts endpoint accepts `job_id` after checking project ownership and job membership. An explicit current batch can be empty without displaying an older batch as new work. Older batches remain stored.

## 2. Show work as it becomes available

The shorts page fetches the latest generation job and then that batch's shorts. It polls every second while work is active, every ten seconds when idle, and every thirty seconds in a hidden tab. Returning to the tab refreshes immediately. Polls schedule after the previous request finishes; cleanup and request sequence guards prevent stale page updates.

Show:

- The actual processing stage and existing progress percentage.
- The count of playable shorts versus selected candidates, when known.
- A first-short arrival message and timeline-sorted cards as each complete short arrives.
- Neutral pending cards for the remaining candidates; no invented completion time.
- A completed batch message. A later failure leaves already published shorts usable.

Only the selected short mounts an active player. Stable short IDs preserve open edits and playback while other shorts arrive. This improves time to **see** results; total media-processing time still depends on transcription, source duration and machine capacity.

## 3. Optional reaction break

The waiting game is loaded in its own small JavaScript chunk only after the user opens it. One timeout handles a random wait and a ten-second missed-turn window. There is no render loop, canvas, tracking or server traffic. Closing the game, leaving the page or hiding the tab cancels its timer. An already opened game remains until closed when processing finishes, so completion does not interrupt a round. A native button supports keyboard and touch. The game uses one calm color change rather than flashing lights.

## 4. Color and motion

Use cool blue surfaces, navy text, violet actions and teal completion states. Theme overrides are centralized in `apps/web/src/theme.css`; video subtitle colors keep their own black-backed treatment.

Target at least 4.5:1 contrast for ordinary text and 3:1 for large text, following [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Token contrast alone does not establish accessibility compliance: rendered backgrounds, disabled controls and video overlays need separate review.

Button feedback and new-result entrances last approximately 160–300 ms. There is no continuous decorative animation. All nonessential animation, transitions and smooth scrolling stop under `prefers-reduced-motion`, consistent with [WCAG motion guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

## 5. Acceptance boundary

Verify with native FFmpeg renders and owned API responses that a ready short is playable while its job is still processing. Check batch isolation, foreign job rejection, complete counts, interrupted polling, optional-game cleanup and readable text in the browser. Record cached-transcript timings separately from full transcription timings. Real Google/Meta consent remains a separate integration check requiring owner registrations.
