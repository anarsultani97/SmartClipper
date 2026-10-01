# Creator quality and processing speed

Research checked 1 October 2026. This extends the web plan; social publishing remains later.

## 1. Import and progress

The center of the upload panel shows actual XHR transfer percentage in a progress ring. At 100%, the browser plays a local object URL while server preparation continues under a separate stage label. Upload completion and server readiness are different states. A reload resumes server progress; it cannot restore a local object URL. Preparation reads FFmpeg's `out_time_us` and maps decoded duration to its stage. Queued work shows 0%, completed work 100%; generation percentages are weighted processing progress, not an exact completion deadline.

The original video and library both have prominent **View shorts** buttons. Each completed short becomes playable while the remaining shorts render. The API publishes a short row only after its preview and covers are complete; regeneration shows the newest generation with complete clips. A failure retains already completed clips and offers a retry under a new job ID.

## 2. Better covers

1. Decode up to 18 full-scene frames in **one** FFmpeg invocation per short. Evaluate the source before any crop.
2. Reject black, washed-out, dark and blurry samples. Run the small, local [OpenCV YuNet face detector](https://docs.opencv.org/4.x/d0/dd4/tutorial_dnn_face.html); rank clear detected faces above edge-heavy backgrounds. Favor recurring face positions, without identifying anyone.
3. Rank first, then deduplicate visually and by time. The first candidate is the recommended default and the video poster. Offer up to three genuinely different clear frames; never duplicate bad frames to fill slots.
4. **People & guests:** frame all detected faces together when possible. If a portrait crop cannot keep them, fit the whole scene on a blurred background.
5. **Gameplay + creator:** keep the entire game scene plus a readable creator portrait. Auto uses this composition only for a small corner facecam, avoiding duplicated portraits in ordinary centered interviews.
6. **Whole scene:** bypass people framing for games, animation, slides and nonhuman subjects. Manual upload and frame capture remain available in the cover editor.

The detector is 232,589 bytes, pinned to an upstream commit and SHA-256, verified before use and cached locally. Its MIT license is in `third-party/YuNet-LICENSE.txt`. Headless OpenCV is server-only; there is no new browser vision library or cloud frame upload. Offline model failure falls back to full-scene quality selection and reports that no confident face was detected. This detects faces, not identities, guests' roles, game protagonists or emotions. Occluded faces and small facecams can be missed; review the alternatives and framing control.

[YouTube's Shorts help](https://support.google.com/youtube/answer/10343433) describes choosing a frame in the YouTube app. A downloadable styled JPEG is useful for destinations that accept it, but it is not an automatically installed YouTube Shorts cover. Use the chosen frame timestamp as a publishing reference.

## 3. Speech, Turkish and censored audio

The [faster-whisper implementation](https://github.com/SYSTRAN/faster-whisper) supports batched inference, multilingual recognition, word timestamps, vocabulary hints and VAD. We use bounded batches, speech filtering, deterministic decoding and a stricter low-confidence review path.

- **Fast:** the configured model (default multilingual `base`), beam 1.
- **Balanced:** multilingual `small` when the configured default is `base`, beam 3 and batch 4.
- **Higher accuracy:** multilingual `medium` when the configured default is `base`, beam 3 and batch 2. A deliberately configured deployment model takes precedence.
- Explicit language plus optional names/slang/game terms improves the information supplied to ASR. All eleven supported languages, including Turkish, remain available. Uploaded timed SRT skips recognition.
- Batched cues are split at existing sentence punctuation using their actual word timestamps. Candidate selection can then combine complete sentence cues for shorter duration preferences, instead of discarding a long batched cue wholesale.
- Cache transcripts by model, mode, language, vocabulary and implementation version. A different requested language retranscribes ASR audio; it rejects a mismatch with an explicitly uploaded transcript. English translations have a separate reusable cache. Following [Whisper's model guidance](https://github.com/openai/whisper), a configured turbo model falls back to a translation-capable multilingual model for English translation.
- Brief, strong, narrow-band tones are marked as possible `[beep]` cues for review. Low-confidence words during near-silence become `[unclear]`; other uncertain lines are marked for correction. Audible speech is not filtered through a profanity list.
- **Missing audio contains no recoverable word.** Neither a beep nor an edited mute reveals the original profanity. Do not infer it from context. Tone detection is conservative and can miss beeps or confuse game sounds; review rather than promise restoration.

[YouTube's caption guidance](https://support.google.com/youtube/answer/6373554) recommends reviewing automated captions and describes recognition problems from unclear or overlapping audio. Recognition of Turkish slang and names is still model-dependent. The smoke sample confirms Turkish processing and aligned words; it is not a word-error-rate benchmark or evidence of perfect recognition. First use downloads models; larger models trade speed and memory for potential accuracy. Production should preload selected models and provision warm workers; GPU inference requires the supported CUDA/cuDNN runtime.

## 4. Readable, editable subtitles

- Suggested previews show styled subtitles immediately, with a clear **Add styled subtitles** button when disabled and an on/off switch.
- Pop (lime), Karaoke (gold) and Clean (white) styles use small groups, safe placement and strong outlines. Active-word color comes from actual ASR alignment. A dedicated fullscreen control keeps the overlay visible.
- The caption editor allows correcting text. Unchanged lines retain alignment; changed lines lose word timing and display short phrases with estimated phrase timing inside their original cue. Uploaded SRT works the same way. We never manufacture exact spoken-word timestamps. Translation alignment also requires review.
- Style, position, language and corrections are revision-protected. Final exports use sanitized ASS captions, including real word highlight events, matching the saved choices. Export options are immutable snapshots, so edits during export cannot silently alter it.
- Preview styling runs in the browser and does not trigger FFmpeg. Animation scheduling stops on pause; React changes only when the active group/word changes. Caption editing loads on demand. English tracks are fetched only when selected.

## 5. Fast first results

Full-size renders are expensive and often discarded. Suggested previews use 480×854, 24 fps and a faster encoder preset. Download renders remain 720×1280, 30 fps and include saved subtitles/music. Both preserve source content on a blurred background. The slight preview aspect rounding is not a change to final 9:16 exports.

The first clip renders before the remainder; then at most two clip tasks run concurrently, with bounded FFmpeg threads. Quality scans and English translations are cached. Import creates the proxy and MP3 in a shared source pass, avoiding another full original-file demux. Live FFmpeg stdout is drained with two reader threads so Windows reports progress before process completion; repeated identical generation percentages do not trigger database writes. The worker remains separate from HTTP request handling. Previews retain original audio; music is applied only to exports. The original ad/context candidate logic is retained.

`tooling/benchmark-media.py` compares the native preview/cover stage with dev commit `3d3ab0e`. This excludes transcription, ranking, upload, preparation and final export. One 45-second FLOSS Weekly excerpt measured 11.579 seconds before versus 6.038 seconds after (47.9% less elapsed time); thumbnail detection added work, while smaller previews delivered the main saving. A warmed rerun is documented in the acceptance record. Actual speed depends on hardware, content, model and cache state. No universal generation-time claim is made.

## 6. Publishing guidance from current platforms

[TikTok's creative guidance](https://ads.tiktok.com/resources/help/article/creative-best-practices?lang=en) favors vertical video, a clear opening, readable text, people and keeping content clear of UI overlays. It is advertising guidance; applying these principles to organic shorts is a product-design inference, not a guarantee of reach. We keep full-context excerpts, readable caption groups, adjustable placement and clear covers. Review the opening, last sentence and context before sharing.

Current music discovery links lead to the platforms' own libraries. We do not claim a built-in song is trending or redistribute recordings with unknown rights. Platform-specific length remains a creator preference. Virality, automatic identity/guest recognition, semantic game-character detection and direct publishing are not promised by this update.

## Validation for this change

The owner explicitly requested skipping unit testing for this round. Build/type checks, formatting/lint, database migration, native-media benchmarks, real speech processing and browser acceptance provide the review evidence. No unit suites are added or run. Commits use `[skip ci]` to prevent the existing automatic workflow from launching unit suites; its normal configuration remains unchanged for future work. An independent agent reviews the PR before merge to dev.
