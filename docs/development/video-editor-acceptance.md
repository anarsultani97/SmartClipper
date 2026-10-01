# Video editor acceptance

Date: 2026-10-01. Local Windows development build. Unit suites and automatic CI were skipped for the current improvements; the evidence below is manual browser/native acceptance, not a unit-test claim.

## Checks completed

| Area | Evidence |
| --- | --- |
| Static/build checks | Frontend TypeScript and production build passed (91.50 KB JS gzip, approximately 3.9 KB above the previous build). Python Ruff passed. No editor dependency added. |
| Database | Migration 0008 applied locally; untouched revision-1 legacy minute selections expand to full duration. Explicit saved selections remain unchanged. |
| Visible shorts | Existing five-minute English Ludwig workspace shows four separate numbered cards in source-time order. The old horizontal tab strip is removed. |
| Preview cost | Four visible cards mount one video element. Other cards use lazy covers. No document-width overflow in the user's current Chrome viewport. |
| Short editing | Browser changed trim 2–40 seconds, brightness/contrast, speed 1.25×, 90° rotation, mirror and fade. Apply persisted all fields; reopening retained them. |
| Trim during playback | While playing at 1.25×, shortened end to 5 seconds within the suggestion. Preview stopped at source time 75.51 seconds and was paused. |
| Source editing | Browser applied source range 1–299 seconds with brightness +1%; a success notice and 4:58 kept duration appeared. Reset/Apply restored the full five-minute source and neutral settings. |
| HTTP source selection | A separate synthetic 90-second fixture imported with full 0–90-second bounds. Generation after source trim 65–88 seconds produced a short at 65–80 seconds and inherited source adjustments. |
| HTTP validation | Stale source/short revisions returned 409. A short trim outside its immutable suggested bounds returned 422. |
| Export | The synthetic short was trimmed to 8 source seconds at 1.25×, horizontally framed, rotated/mirrored, colour/audio adjusted and faded. Its downloaded MP4 was 1280×720, 6.400 seconds, with audio and appropriately sized ASS captions. |
| Phrase-only captions | A caption without word alignment was grouped on its original clock, then trimmed into its second phrase. Preview and first exported ASS dialogue both retained “echo foxtrot golf hotel”; discarded first-phrase text did not reappear. |

## Audio offset checks

A native fixture starts its audible tone at 1.2 seconds. Decode/export checks measured the first audible output sample:

| Variant | Expected onset | Measured onset | Output |
| --- | ---: | ---: | --- |
| Normal | 1.200 s | 1.194 s | 720×1280, 5.000 s |
| 2× speed | 0.600 s | 0.596 s | 720×1280, 2.500 s |
| Trim from 0.5 s, 1.25× speed | 0.560 s | 0.554 s | 1280×720, 3.600 s |

The small differences include codec priming. Both media streams preserve their shared source clock instead of independently dropping initial offsets.

## Review corrections

Independent review of the first commit identified the legacy minute selection, active-playback trim loop, independent audio timestamp reset, mirror/rotation order and phrase regrouping. All five were corrected. Preview captions now follow fades too.

## Review artifacts and limitations

Ignored local artifacts: `.cache/editor-shorts.jpg`, `.cache/editor-source.jpg`, `.cache/editor-acceptance/report.json`. Media and development account credentials are not committed.

The user workspace retains all four shorts, with the first demonstrating horizontal format and the others vertical. Temporary trim, colour, speed and orientation changes were reset after verification; existing caption/music choices were preserved.

Browser colour filters can differ slightly from native encoding. Only the user's current Windows Chrome viewport was inspected; this is not a Safari/macOS, production-load or universal caption-accuracy claim. Multi-track editing and original-resolution rendering remain future work.
