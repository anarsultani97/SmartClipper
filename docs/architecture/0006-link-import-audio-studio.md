# Public links and the sound studio

Date: 2026-10-01. Working product name: **Clivvy**. Repo/package/environment identifiers retain SmartClipper. Clipp already has a [video-sharing product](https://www.clipp.gg/). Clivvy is a provisional naming decision; indexed search is not domain or trademark clearance.

## Import workflow

1. Choose **Paste video link** from any workspace or the first-page import card.
2. Paste one public YouTube video/Short, TikTok video/share link, Instagram Reel/post or Facebook video/reel/watch/share link.
3. The API validates the HTTPS host and video path, removes tracking queries, rejects credentials, playlists and unsupported hosts, and queues an owned Project. The API does not fetch the link during the request.
4. A subprocess uses [yt-dlp](https://github.com/yt-dlp/yt-dlp#embedding-yt-dlp), locked through `uv.lock`. One worker imports at a time; a workspace may queue two link imports. Node is the configured local JavaScript runtime for YouTube extraction; the installed yt-dlp-ejs component supplies challenges, with remote components disabled.
5. The downloader rejects live/unknown-duration/over-30-minute sources, limits downloads to 1080p MP4 and 3 GB, and reports download progress. It does not read browser cookies, user configuration or netrc. Only the four platform extractor families are allowed; generic arbitrary-file extraction is disabled.
6. In the downloader process, DNS results and connection addresses are checked before connection; private, loopback, mapped-private IPv6 and multicast addresses are rejected for platform, redirect, manifest and CDN requests. Environment proxies are disabled. Downloader selection explicitly allows only HTTP/HLS/DASH protocols and the three corresponding native downloader classes. External, RTMP and direct native-HLS fallback-to-FFmpeg execution are blocked; unsupported formats fail with an MP4-upload alternative. FFmpeg remains available only for local postprocessing, with merger input protocols constrained to local file/pipe. Hosted deployment also needs worker egress restrictions and account-level anti-abuse quotas. Both new imports and retries enforce the active-link quota under the owner row lock.
7. Download finishes at 40% overall; existing preparation continues from 40% to 100%. The original is probed, proxied, and speech/audio prepared. Source edit bounds cover the entire imported video.
8. Failed imports expose a concise error and MP4-upload fallback. Retry uses the stored canonical link. Queue removal terminates the import subprocess and its process tree, then removes its project files.

Public does not guarantee downloadable. Private, sign-in-only, geographic or provider-blocked videos can fail. No access-control bypass is provided. Downloaded source/merged intermediates can temporarily require additional disk space. Only YouTube was verified live for this change; other extractor integrations need representative public fixtures before a production support guarantee.

## Sound workflow

1. Open **Edit short**, then **Sound studio**. Choose from six original synthesized beds or upload your own music; no trending popularity claim is attached to the beds.
2. Set music volume and the point to start within the track. Music loops to fill the short. The built-in library uses the same deterministic 60-second WAV arrangement in preview and export.
3. Record a hook/commentary using **Record my voice**, review the recording and choose **Use recording**; alternatively upload a voice file. Microphone access is requested only on click. Stop, timeout and unmount release microphone tracks. [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) and [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) require a compatible browser and HTTPS/localhost.
4. Choose voice volume and its start time in the resulting short. Original dialogue volume is controlled in Picture & sound. Lower it or set it to zero for replacement narration.
5. Audio uploads are owned by the short's project, limited to 20 MB / 10 minutes, and normalized to mono 22,050 Hz WAV. Missing duration metadata in browser WebM is handled by bounded decode, followed by validation of the actual decoded duration. Container and protocol allowlists reject playlist-based audio inputs. Maximum 16 immutable takes/uploads per short; retention/library management is a future step.
6. Preview mounts audio only for the active short, synchronizes it to edited elapsed time, pauses on seek/bounds/unmount, and follows fades. Preview gains are approximate; exported audio has a limiter to protect mixed peaks. Other cards retain lazy posters.
7. **Apply changes** persists validated `AudioEdits` with optimistic revisions. The API checks asset kind and owning short; IDs cannot reference another workspace/short. A voice start after the edited short's end is rejected.
8. Export jobs snapshot audio IDs, gains, offsets and video settings. Assets are immutable, so later uploads do not alter queued jobs. FFmpeg mixes original dialogue, looping music and delayed voice, pads short audio to the output duration, applies fades/limiting, and encodes AAC in the downloaded MP4.

Voice start times are in the final output clock: changing source trim or playback speed does not speed-shift recorded narration. Existing source captions describe source speech; newly recorded narration is not automatically transcribed yet. Multi-track voice editing and automatic ducking remain future work.

## Popular music: two catalogs

**Exportable audio now:** original beds and the user's cleared uploads. Users must have permission to include uploaded recordings in exported videos.

**Platform discovery now:** links to [TikTok music discovery](https://ads.tiktok.com/business/creativecenter/music/pc/en), [Meta Sound Collection](https://www.facebook.com/sound/collection/) and [YouTube Shorts music guidance](https://support.google.com/youtube/answer/13486873). The app does not copy these recordings into its own catalog. Meta describes differences between licensed music and [Sound Collection access](https://www.facebook.com/help/instagram/402084904469945); availability depends on account/use. TikTok's [creative guidance](https://ads.tiktok.com/business/library/Creative_Codes_ENG.pdf) distinguishes cleared commercial music from original sounds requiring clearance.

For an Instagram-like searchable picker, implement in this order:

1. Create a provider adapter and Track record: title, artist, provider ID, preview URL, territory/platform, duration, moods, available use, license expiry, source of trend evidence and last verified timestamp. Keep playable/export rights separate from discovery metadata.
2. Connect a licensed music provider through its approved API/business agreement for downloadable audio that can be baked into cross-platform MP4 exports. Cache search metadata and worker-ready audio; do not load a full catalog into the browser. Every queued export checks that the selected track permits the intended platform/use.
3. For popular platform songs, verify official API access/permissions for the connected account. Meta's Instagram Audio API is an integration candidate to evaluate when social connections are implemented; this change does not verify access, scrape a private API or claim that a platform's sound license permits cross-platform downloads.
4. Keep unavailable platform sounds as discovery/deep links, showing title, provider, region and observation date only when obtained from an authorized feed or curated review. Never invent charts or label mood matches as trends.
5. Add region/platform and genre filters, short previews, saved favorites, and context/mood recommendations. Paginate search and cache metadata; mix/download audio only after selection. Refresh popularity on a scheduled provider job, with freshness visible to the user.
6. When platform publishing is added, attach an eligible platform audio ID through the official publishing API where supported. Otherwise guide users to add that song inside the target app after downloading their video.

This provides useful music now while leaving a concrete integration path for popular licensed recordings. No music-provider secret, live trending feed, or social publishing connection was added by this update.
