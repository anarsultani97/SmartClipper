# Simple UI, games and transcripts — 2026-10-02

## Changes

- Use **Play game**, **Wait for green**, **Writing subtitles** and other short, clear labels.
- Put Play game above one progress circle. A gentle shadow glow runs three times and stops. Opening the game loads its code on demand.
- Offer the same game during file upload, video preparation and shorts creation. Closing it or hiding the tab clears its timers. An open game can finish after shorts processing ends.
- Celebrate reactions of 300 ms or less with a short confetti effect. Show a gentle sad-face message only at 1500 ms or more, or after a missed 10-second round. Ordinary scores and early taps do not get negative feedback.
- Respect reduced-motion settings: disable animations, transitions and confetti.
- Show **What’s in this moment?** by default. Display complete spoken text, with no generated introductions, speaker explanations or timestamp labels. Older stored summaries have their generated wrappers removed when used as a fallback.
- Highlight up to four repeated longer words to help scan the text. This is a small local text heuristic; it is not a claim about why an AI chose a clip.
- Use 17px dark text on white for the transcript and larger editor labels. Keep timing data internally for synchronization and trimming; subtitle edit rows show only the words.

## Ads and later revenue

The main page has a clearly labeled **AD PREVIEW** banner after the feature row. It is a static sample, with no advertiser, tracking, paid clicks or ad network calls.

After the MVP, assess one sponsor banner or an approved publisher network. AdSense requires an eligible site and review; it does not guarantee approval or revenue. Paid ads should stay separate from gameplay, upload controls and downloads, with clear ad labels. Never encourage clicks or use the game to generate them. Domain, hosting and pricing decisions remain for the completed MVP.

References: [Google eligibility](https://support.google.com/adsense/answer/9724/eligibility-requirements-for-adsense), [Google program rules](https://support.google.com/adsense/answer/48182/adsense-programme-policies), [W3C contrast and motion guidance](https://www.w3.org/TR/WCAG22/).

## Checks

- Local backend: 91 tests passed, including native media checks.
- Local frontend: 39 tests passed, including upload game availability, control order, fast/slow scores, timer cleanup, completion, plain transcript preservation and escaped text.
- Ruff, Prettier and production build passed.
- Real local shorts page: full transcript visible by default, 17px `#24334b` text on white, editing words without visible cue timestamps.
- Isolated browser UI fixture: Play game is above the progress circle, glow is present, game opens and rounds work. This fixture uses fixed progress and never touches the user's media database. It is not a performance benchmark.
- Production game chunk: approximately 1.68 kB gzip. Initial JavaScript increased by approximately 0.7 kB gzip; no game or animation package added.
