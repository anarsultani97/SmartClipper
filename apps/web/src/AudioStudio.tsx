import { useEffect, useRef, useState } from "react";
import { Mic, Music2, Square, Upload, X, LoaderCircle } from "lucide-react";
import * as api from "./api";
import { formatTime } from "./media";

export const defaultAudio: api.AudioEdits = {
  music_asset_id: null,
  voice_asset_id: null,
  music_volume: 0.16,
  voice_volume: 1,
  music_offset: 0,
  voice_start: 0,
};
export const normalizeAudio = (value?: api.AudioEdits) => ({
  ...defaultAudio,
  ...value,
});
export type PreviewAudio = {
  src: string;
  volume: number;
  startAt: number;
  offset: number;
  loop: boolean;
};
export function previewAudio(short: api.Short): PreviewAudio[] {
  const audio = normalizeAudio(short.audio_edits);
  const tracks: PreviewAudio[] = [];
  if (
    short.music !== "none" &&
    (short.music !== "custom" || audio.music_asset_id)
  )
    tracks.push({
      src:
        short.music === "custom"
          ? api.audioMedia(short.id, audio.music_asset_id!)
          : api.musicPreview(short.music),
      volume: audio.music_volume,
      startAt: 0,
      offset: audio.music_offset,
      loop: true,
    });
  if (audio.voice_asset_id)
    tracks.push({
      src: api.audioMedia(short.id, audio.voice_asset_id),
      volume: audio.voice_volume,
      startAt: audio.voice_start,
      offset: 0,
      loop: false,
    });
  return tracks;
}

function VoiceRecorder({
  duration,
  onUse,
  busy,
}: {
  duration: number;
  onUse: (file: File) => Promise<void>;
  busy: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "requesting" | "recording">(
    "idle",
  );
  const [seconds, setSeconds] = useState(0),
    [blob, setBlob] = useState<Blob | null>(null),
    [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | undefined>(undefined),
    limit = useRef<number | undefined>(undefined),
    mounted = useRef(true);
  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };
  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stopTracks();
    clearInterval(timer.current);
    clearTimeout(limit.current);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current) recorder.current.onstop = null;
      stop();
    };
  }, []);
  useEffect(() => {
    const next = blob ? URL.createObjectURL(blob) : "";
    setUrl(next);
    return () => {
      if (next) URL.revokeObjectURL(next);
    };
  }, [blob]);
  async function start() {
    setError("");
    setStatus("requesting");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Voice recording needs HTTPS or localhost and a supported browser. You can upload a voice file instead.",
        );
      const capture = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (!mounted.current) {
        capture.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = capture;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recording = new MediaRecorder(
        capture,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recording.onerror = () => {
        stop();
        if (mounted.current) {
          setStatus("idle");
          setError("Recording stopped unexpectedly. Please try again.");
        }
      };
      recording.onstop = () => {
        stopTracks();
        clearInterval(timer.current);
        clearTimeout(limit.current);
        if (mounted.current) {
          setBlob(new Blob(chunks, { type: recording.mimeType }));
          setStatus("idle");
        }
      };
      setBlob(null);
      setSeconds(0);
      recording.start(250);
      setStatus("recording");
      const began = Date.now();
      timer.current = window.setInterval(
        () => setSeconds((Date.now() - began) / 1000),
        250,
      );
      limit.current = window.setTimeout(
        stop,
        Math.max(1, Math.min(600, duration)) * 1000,
      );
    } catch (e) {
      stopTracks();
      if (mounted.current) {
        setStatus("idle");
        setError(
          e instanceof Error && e.name !== "NotAllowedError"
            ? e.message
            : "Microphone access was not granted. Allow it to record, or upload a voice file.",
        );
      }
    }
  }
  return (
    <div className="voice-recorder">
      <p className="hint">
        Record a hook, commentary or closing line. Your voice starts at the
        offset below.
      </p>
      <div className="audio-button-row">
        {status === "recording" ? (
          <button className="record-stop" onClick={stop}>
            <Square size={16} /> Stop recording · {formatTime(seconds)}
          </button>
        ) : (
          <button
            className="secondary"
            disabled={busy || status === "requesting"}
            onClick={() => void start()}
          >
            <Mic size={16} />
            {status === "requesting"
              ? "Waiting for microphone…"
              : blob
                ? "Record again"
                : "Record my voice"}
          </button>
        )}
        {blob && status === "idle" && (
          <>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                try {
                  const extension = blob.type.includes("mp4")
                    ? "m4a"
                    : blob.type.includes("ogg")
                      ? "ogg"
                      : "webm";
                  await onUse(
                    new File([blob], `My voice recording.${extension}`, {
                      type: blob.type,
                    }),
                  );
                  if (mounted.current) setBlob(null);
                } catch {
                  /* Preserve the take; the upload panel reports the error. */
                }
              }}
            >
              Use recording
            </button>
            <button
              className="text-button"
              aria-label="Discard recording"
              onClick={() => setBlob(null)}
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
      {url && (
        <audio controls src={url} aria-label="Review my voice recording" />
      )}
      {error && (
        <p role="alert" className="editor-validation">
          {error}
        </p>
      )}
    </div>
  );
}

export function AudioStudio({
  short,
  onChange,
  onActivate,
  onError,
}: {
  short: api.Short;
  onChange: (short: api.Short) => void;
  onActivate: () => void;
  onError: (e: unknown) => void;
}) {
  const audio = normalizeAudio(short.audio_edits);
  const [tracks, setTracks] = useState<api.MusicTrack[]>([]),
    [assets, setAssets] = useState<api.AudioAsset[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const musicFile = useRef<HTMLInputElement>(null),
    voiceFile = useRef<HTMLInputElement>(null);
  const current = useRef(short);
  current.current = short;
  useEffect(() => {
    let alive = true;
    Promise.all([api.musicLibrary(), api.audioAssets(short.id)])
      .then(([library, files]) => {
        if (alive) {
          setTracks(library);
          setAssets(files);
        }
      })
      .catch((e) => {
        if (alive) onError(e);
      });
    return () => {
      alive = false;
    };
  }, [short.id]);
  const change = (patch: Partial<api.AudioEdits>) => {
    onChange({ ...short, audio_edits: { ...audio, ...patch } });
    onActivate();
  };
  async function upload(kind: "music" | "voice", file?: File) {
    if (!file || busy) return;
    if (file.size > 20 * 1024 * 1024) {
      onError(new Error("Choose an audio file up to 20 MB."));
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const asset = await api.uploadAudio(short.id, kind, file);
      setAssets((old) => [...old, asset]);
      const latest = current.current;
      onChange({
        ...latest,
        ...(kind === "music" ? { music: "custom" } : {}),
        audio_edits: {
          ...normalizeAudio(latest.audio_edits),
          ...(kind === "music"
            ? { music_asset_id: asset.id, music_offset: 0 }
            : { voice_asset_id: asset.id, voice_start: 0 }),
        },
      });
      onActivate();
      setNotice(
        "Audio is ready to preview. Choose Apply changes to save it with this short.",
      );
    } catch (e) {
      onError(e);
      throw e;
    } finally {
      setBusy(false);
      if (musicFile.current) musicFile.current.value = "";
      if (voiceFile.current) voiceFile.current.value = "";
    }
  }
  const duration =
    ((short.video_edits?.trim_end_ms ?? short.end_ms - short.start_ms) -
      (short.video_edits?.trim_start_ms ?? 0)) /
    1000 /
    (short.video_edits?.speed ?? 1);
  return (
    <section className="audio-studio">
      <h3>
        <Music2 size={18} /> Sound studio
      </h3>
      <p className="hint">
        Listen in the video preview. Your chosen music and voice are mixed into
        the downloaded MP4.
      </p>
      <label>
        Background music
        <select
          value={
            short.music === "custom"
              ? `asset:${audio.music_asset_id}`
              : short.music
          }
          onChange={(e) => {
            const value = e.target.value;
            const custom = value.startsWith("asset:");
            onChange({
              ...short,
              music: custom ? "custom" : value,
              audio_edits: {
                ...audio,
                music_asset_id: custom ? value.slice(6) : null,
                music_offset: 0,
              },
            });
            onActivate();
          }}
        >
          <option value="none">No added music</option>
          {tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.name} · {track.mood}
            </option>
          ))}
          {assets
            .filter((asset) => asset.kind === "music")
            .map((asset) => (
              <option key={asset.id} value={`asset:${asset.id}`}>
                {asset.filename} · uploaded
              </option>
            ))}
        </select>
      </label>
      {short.music !== "none" && (
        <div className="adjustment-grid">
          <label>
            Music volume · {Math.round(audio.music_volume * 100)}%
            <input
              aria-label="Music volume"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={audio.music_volume}
              onChange={(e) => change({ music_volume: Number(e.target.value) })}
            />
          </label>
          <label>
            Start music at (seconds)
            <input
              type="number"
              min={0}
              max={
                short.music === "custom"
                  ? Math.max(
                      0,
                      (assets.find((a) => a.id === audio.music_asset_id)
                        ?.duration_seconds ?? 600) - 0.1,
                    )
                  : 59.9
              }
              step={0.1}
              value={audio.music_offset}
              onChange={(e) => change({ music_offset: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      <input
        ref={musicFile}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a"
        className="sr-only"
        aria-label="Upload music file"
        onChange={(e) =>
          void upload("music", e.target.files?.[0]).catch(() => {})
        }
      />
      <input
        ref={voiceFile}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a"
        className="sr-only"
        aria-label="Upload voice file"
        onChange={(e) =>
          void upload("voice", e.target.files?.[0]).catch(() => {})
        }
      />
      <button
        className="secondary"
        disabled={busy}
        onClick={() => musicFile.current?.click()}
      >
        <Upload size={15} /> Upload my music
      </button>
      <p className="hint">
        Use music you have permission to include in exported videos. Up to 20 MB
        / 10 minutes.
      </p>
      <div className="voice-section">
        <h4>
          <Mic size={16} /> Your voiceover
        </h4>
        <label>
          Voice track
          <select
            value={audio.voice_asset_id ?? "none"}
            onChange={(e) =>
              change({
                voice_asset_id:
                  e.target.value === "none" ? null : e.target.value,
              })
            }
          >
            <option value="none">No voiceover</option>
            {assets
              .filter((a) => a.kind === "voice")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.filename} · {formatTime(a.duration_seconds)}
                </option>
              ))}
          </select>
        </label>
        {audio.voice_asset_id && (
          <div className="adjustment-grid">
            <label>
              Voice volume · {Math.round(audio.voice_volume * 100)}%
              <input
                aria-label="Voice volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={audio.voice_volume}
                onChange={(e) =>
                  change({ voice_volume: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Voice starts in short (seconds)
              <input
                type="number"
                min={0}
                max={Math.max(0, duration - 0.1)}
                step={0.1}
                value={audio.voice_start}
                onChange={(e) =>
                  change({ voice_start: Number(e.target.value) })
                }
              />
            </label>
          </div>
        )}
        <VoiceRecorder
          duration={duration}
          busy={busy}
          onUse={(file) => upload("voice", file)}
        />
        <button
          className="text-button"
          disabled={busy}
          onClick={() => voiceFile.current?.click()}
        >
          <Upload size={14} /> Or upload a voice file
        </button>
      </div>
      {busy && (
        <p role="status">
          <LoaderCircle className="spin" size={16} /> Preparing your audio…
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <details className="music-discovery">
        <summary>Discover popular songs</summary>
        <p>
          Browse current songs in each platform’s library, then add
          platform-licensed music there when publishing. Our six original beds
          and your cleared uploads are included in exports.
        </p>
        <a
          href="https://ads.tiktok.com/business/creativecenter/music/pc/en"
          target="_blank"
          rel="noreferrer"
        >
          TikTok music discovery ↗
        </a>
        <a
          href="https://www.facebook.com/sound/collection/"
          target="_blank"
          rel="noreferrer"
        >
          Instagram / Facebook Sound Collection ↗
        </a>
        <a
          href="https://support.google.com/youtube/answer/13486873"
          target="_blank"
          rel="noreferrer"
        >
          YouTube Shorts music ↗
        </a>
      </details>
    </section>
  );
}
