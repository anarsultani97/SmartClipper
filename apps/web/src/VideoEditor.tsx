import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
} from "lucide-react";
import type { VideoEdits } from "./api";
import { formatTime } from "./media";

export const defaultEdits: VideoEdits = {
  framing: "vertical",
  fit: "fit",
  trim_start_ms: 0,
  trim_end_ms: null,
  brightness: 0,
  contrast: 1,
  saturation: 1,
  speed: 1,
  volume: 1,
  fade_in: 0,
  fade_out: 0,
  rotation: 0,
  flip: false,
};
export const normalizeEdits = (edits?: Partial<VideoEdits>): VideoEdits => ({
  ...defaultEdits,
  ...edits,
});
export const validTrim = (edits: VideoEdits, durationMs: number) =>
  Number.isFinite(edits.trim_start_ms) &&
  Number.isFinite(edits.trim_end_ms ?? durationMs) &&
  edits.trim_start_ms >= 0 &&
  (edits.trim_end_ms ?? durationMs) <= durationMs &&
  ((edits.trim_end_ms ?? durationMs) - edits.trim_start_ms) / edits.speed >=
    500;

export function FramingToggle({
  value,
  onChange,
}: {
  value: VideoEdits;
  onChange: (value: VideoEdits) => void;
}) {
  return (
    <div className="framing-toggle" role="group" aria-label="Video format">
      <button
        aria-pressed={value.framing === "vertical"}
        onClick={() => onChange({ ...value, framing: "vertical" })}
      >
        Vertical <small>9:16</small>
      </button>
      <button
        aria-pressed={value.framing === "horizontal"}
        onClick={() =>
          onChange({ ...value, framing: "horizontal", fit: "fit" })
        }
      >
        Full horizontal <small>16:9</small>
      </button>
    </div>
  );
}

export function VideoEditor({
  value,
  durationMs,
  onChange,
  source = false,
}: {
  value: VideoEdits;
  durationMs: number;
  onChange: (value: VideoEdits) => void;
  source?: boolean;
}) {
  const end = value.trim_end_ms ?? durationMs;
  const set = <K extends keyof VideoEdits>(key: K, val: VideoEdits[K]) =>
    onChange({ ...value, [key]: val });
  const range = (
    label: string,
    key:
      | "brightness"
      | "contrast"
      | "saturation"
      | "volume"
      | "fade_in"
      | "fade_out",
    min: number,
    max: number,
    step: number,
    text: string,
  ) => (
    <label className="adjustment" key={key}>
      <span>
        {label}
        <output>{text}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value[key]}
        onChange={(e) => set(key, Number(e.target.value))}
      />
    </label>
  );
  return (
    <div className="video-editor">
      <div className="editor-section-heading">
        <h3>
          <Scissors size={16} /> Trim {source ? "original video" : "this short"}
        </h3>
        <span>
          {formatTime((end - value.trim_start_ms) / 1000 / value.speed)} kept
        </span>
      </div>
      <p className="hint">
        {source
          ? "Shorts will be suggested only within this selection."
          : "Trim within the suggested moment. Your original video stays intact."}
      </p>
      <div className="trim-track" aria-hidden="true">
        <span
          style={{
            left: `${(value.trim_start_ms / durationMs) * 100}%`,
            width: `${(Math.max(0, end - value.trim_start_ms) / durationMs) * 100}%`,
          }}
        />
      </div>
      <div className="trim-inputs">
        <label>
          Start (seconds)
          <input
            type="number"
            min={0}
            max={Math.max(0, end / 1000 - 0.5)}
            step={0.01}
            value={value.trim_start_ms / 1000}
            onChange={(e) =>
              set("trim_start_ms", Math.round(Number(e.target.value) * 1000))
            }
          />
        </label>
        <label>
          End (seconds)
          <input
            type="number"
            min={value.trim_start_ms / 1000 + 0.5}
            max={durationMs / 1000}
            step={0.01}
            value={end / 1000}
            onChange={(e) =>
              set("trim_end_ms", Math.round(Number(e.target.value) * 1000))
            }
          />
        </label>
      </div>
      <div className="trim-sliders">
        <label>
          Trim start
          <input
            type="range"
            aria-label="Trim start"
            min={0}
            max={Math.max(0, end - 500 * value.speed)}
            step={1}
            value={value.trim_start_ms}
            onChange={(e) => set("trim_start_ms", Number(e.target.value))}
          />
        </label>
        <label>
          Trim end
          <input
            type="range"
            aria-label="Trim end"
            min={Math.min(
              durationMs,
              value.trim_start_ms + Math.ceil(500 * value.speed),
            )}
            max={durationMs}
            step={1}
            value={end}
            onChange={(e) => set("trim_end_ms", Number(e.target.value))}
          />
        </label>
      </div>
      {!validTrim(value, durationMs) && (
        <p role="alert" className="editor-validation">
          Choose a range within the video with at least half a second of
          playback.
        </p>
      )}
      <div className="editor-section-heading">
        <h3>
          <SlidersHorizontal size={16} /> Picture & sound
        </h3>
      </div>
      <div className="adjustment-grid">
        {range(
          "Brightness",
          "brightness",
          -0.3,
          0.3,
          0.01,
          `${Math.round(value.brightness * 100)}%`,
        )}
        {range(
          "Contrast",
          "contrast",
          0.5,
          1.5,
          0.01,
          `${Math.round(value.contrast * 100)}%`,
        )}
        {range(
          "Colour",
          "saturation",
          0,
          2,
          0.05,
          `${Math.round(value.saturation * 100)}%`,
        )}
        {range(
          "Volume",
          "volume",
          0,
          1,
          0.05,
          value.volume === 0 ? "Muted" : `${Math.round(value.volume * 100)}%`,
        )}
      </div>
      <details className="advanced-edits">
        <summary>Advanced edits</summary>
        <div className="adjustment-grid">
          <label>
            Playback speed
            <select
              value={value.speed}
              onChange={(e) => set("speed", Number(e.target.value))}
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                <option key={speed} value={speed}>
                  {speed}×{speed === 1 ? " · normal" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rotate
            <select
              value={value.rotation}
              onChange={(e) =>
                set(
                  "rotation",
                  Number(e.target.value) as VideoEdits["rotation"],
                )
              }
            >
              {[0, 90, 180, 270].map((rotation) => (
                <option key={rotation} value={rotation}>
                  {rotation}°
                </option>
              ))}
            </select>
          </label>
          {range(
            "Fade in",
            "fade_in",
            0,
            2,
            0.1,
            `${value.fade_in.toFixed(1)}s`,
          )}
          {range(
            "Fade out",
            "fade_out",
            0,
            2,
            0.1,
            `${value.fade_out.toFixed(1)}s`,
          )}
          {!source && value.framing === "vertical" && (
            <label>
              Vertical framing
              <select
                value={value.fit}
                onChange={(e) =>
                  set("fit", e.target.value as VideoEdits["fit"])
                }
              >
                <option value="fit">Whole scene · padding</option>
                <option value="fill">Fill frame · centre crop</option>
              </select>
            </label>
          )}
        </div>
        <label className="toggle-label">
          <span>Mirror horizontally</span>
          <input
            type="checkbox"
            role="switch"
            checked={value.flip}
            onChange={(e) => set("flip", e.target.checked)}
          />
        </label>
        {value.fit === "fill" && !source && (
          <p className="hint">
            Centre cropping can cut out people or text. Check the preview before
            applying.
          </p>
        )}
      </details>
      <button
        className="text-button editor-reset"
        onClick={() => onChange({ ...defaultEdits, framing: value.framing })}
      >
        <RotateCcw size={14} /> Reset edits
      </button>
    </div>
  );
}

type AudioTrack = {
  src: string;
  volume: number;
  startAt: number;
  offset: number;
  loop: boolean;
};
function MixedAudioTrack({
  track,
  elapsed,
  playing,
  fade,
}: {
  track: AudioTrack;
  elapsed: number;
  playing: boolean;
  fade: number;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState("");
  const sync = () => {
    const audio = player.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, track.volume * fade));
    if (
      !audio.readyState ||
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0
    )
      return;
    const desired = track.offset + elapsed - track.startAt;
    const active =
      playing && desired >= 0 && (track.loop || desired < audio.duration);
    const position = track.loop
      ? Math.max(0, desired) % audio.duration
      : Math.max(0, Math.min(desired, audio.duration));
    if (Math.abs(audio.currentTime - position) > 0.15)
      audio.currentTime = position;
    if (active && audio.paused)
      void audio.play().catch(() => {
        if (player.current === audio)
          setError(
            "Added audio could not play. Press play again or reselect your track.",
          );
      });
    if (!active && !audio.paused) audio.pause();
  };
  useEffect(sync, [
    track.src,
    track.volume,
    track.startAt,
    track.offset,
    track.loop,
    elapsed,
    playing,
    fade,
  ]);
  useEffect(() => {
    const element = player.current;
    return () => element?.pause();
  }, []);
  return (
    <>
      <audio
        ref={player}
        src={track.src}
        loop={track.loop}
        preload="metadata"
        onLoadedMetadata={sync}
        onError={() =>
          setError(
            "Selected audio is unavailable. Try uploading or selecting it again.",
          )
        }
      />
      {error && (
        <p className="editor-validation" role="status">
          {error}
        </p>
      )}
    </>
  );
}
function MixedAudio({
  tracks,
  elapsed,
  playing,
  fade,
}: {
  tracks: AudioTrack[];
  elapsed: number;
  playing: boolean;
  fade: number;
}) {
  return (
    <>
      {tracks.map((track) => (
        <MixedAudioTrack
          key={track.src}
          track={track}
          elapsed={elapsed}
          playing={playing}
          fade={fade}
        />
      ))}
    </>
  );
}

export function EditedVideoPlayer({
  src,
  poster,
  edits,
  start,
  end,
  captions,
  label = "Video preview",
  audioTracks,
}: {
  src: string;
  poster?: string;
  edits: VideoEdits;
  start: number;
  end: number;
  captions?: (sourceTime: number) => ReactNode;
  label?: string;
  audioTracks?: {
    src: string;
    volume: number;
    startAt: number;
    offset: number;
    loop: boolean;
  }[];
}) {
  const video = useRef<HTMLVideoElement>(null),
    wrapper = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(start),
    [playing, setPlaying] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 1280, height: 720 });
  const [box, setBox] = useState({ width: 480, height: 854 });
  const [error, setError] = useState("");
  const filterId = `brightness-${useId().replace(/:/g, "")}`;
  const duration = Math.max(0.001, (end - start) / edits.speed);
  const elapsed = Math.max(0, Math.min(duration, (time - start) / edits.speed));
  const fade = Math.min(edits.fade_in, duration / 2),
    fadeOut = Math.min(edits.fade_out, duration / 2);
  const opacity = Math.min(
    fade ? elapsed / fade : 1,
    fadeOut ? (duration - elapsed) / fadeOut : 1,
    1,
  );
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    player.playbackRate = edits.speed;
    player.volume = Math.min(1, edits.volume * Math.max(0, opacity));
    if (
      player.readyState &&
      (player.currentTime < start || player.currentTime > end)
    )
      player.currentTime = start;
  }, [edits.speed, edits.volume, opacity, start, end]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setBox({ width: rect.width, height: rect.height });
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    let frame = 0,
      lastTime = -1;
    const update = () => {
      if (Math.abs(player.currentTime - lastTime) >= 1 / 24) {
        lastTime = player.currentTime;
        setTime(player.currentTime);
      }
      if (player.currentTime >= end) {
        player.pause();
        player.currentTime = end;
        setTime(end);
      }
      if (!player.paused) frame = requestAnimationFrame(update);
    };
    const play = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    player.addEventListener("play", play);
    if (!player.paused) play();
    return () => {
      cancelAnimationFrame(frame);
      player.removeEventListener("play", play);
    };
  }, [end]);
  const rotated = edits.rotation === 90 || edits.rotation === 270;
  const scale = (
    edits.fit === "fill" && edits.framing === "vertical" ? Math.max : Math.min
  )(
    box.width / (rotated ? dimensions.height : dimensions.width),
    box.height / (rotated ? dimensions.width : dimensions.height),
  );
  const toggle = () => {
    const player = video.current;
    if (!player) return;
    if (player.paused) {
      if (player.currentTime >= end - 0.05 || player.currentTime < start)
        player.currentTime = start;
      void player
        .play()
        .catch(() => setError("This video could not start. Try again."));
    } else player.pause();
  };
  return (
    <div ref={wrapper} className={`edited-player ${edits.framing}`}>
      <svg width="0" height="0" className="colour-filter" aria-hidden="true">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              {["R", "G", "B"].map((channel) => {
                const Tag = `feFunc${channel}` as "feFuncR";
                return (
                  <Tag
                    key={channel}
                    type="linear"
                    slope="1"
                    intercept={edits.brightness}
                  />
                );
              })}
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <div ref={viewport} className="edited-viewport">
        <video
          ref={video}
          aria-label={label}
          tabIndex={0}
          preload="metadata"
          src={src}
          poster={poster}
          style={{
            width: dimensions.width * scale,
            height: dimensions.height * scale,
            transform: `translate(-50%,-50%) scaleX(${edits.flip ? -1 : 1}) rotate(${edits.rotation}deg)`,
            filter: `contrast(${edits.contrast}) saturate(${edits.saturation}) url(#${filterId})`,
            opacity: Math.max(0, opacity),
          }}
          onLoadedMetadata={(e) => {
            const player = e.currentTarget;
            setDimensions({
              width: player.videoWidth,
              height: player.videoHeight,
            });
            player.currentTime = start;
            setTime(start);
            player.playbackRate = edits.speed;
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onError={() =>
            setError("Preview could not load. Reopen this video and try again.")
          }
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.code === "Space") {
              e.preventDefault();
              toggle();
            }
          }}
        />
        <div
          className="caption-layer"
          style={{ opacity: Math.max(0, opacity) }}
        >
          {captions?.(time)}
        </div>
        <button
          className="caption-fullscreen"
          aria-label="Fullscreen with subtitles"
          onClick={() =>
            void wrapper.current?.requestFullscreen().catch(() => {})
          }
        >
          <Maximize2 size={17} />
        </button>
      </div>
      <div className="edited-player-controls">
        <button
          aria-label={playing ? "Pause preview" : "Play preview"}
          onClick={toggle}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <span>{formatTime(elapsed)}</span>
        <input
          type="range"
          aria-label="Seek preview"
          min={0}
          max={duration}
          step={0.01}
          value={elapsed}
          onChange={(e) => {
            if (video.current) {
              video.current.currentTime =
                start + Number(e.target.value) * edits.speed;
              setTime(video.current.currentTime);
            }
          }}
        />
        <span>{formatTime(duration)}</span>
      </div>
      {error && (
        <p role="alert" className="editor-validation">
          {error}
        </p>
      )}
      {audioTracks && (
        <MixedAudio
          tracks={audioTracks}
          elapsed={elapsed}
          playing={playing}
          fade={Math.max(0, opacity)}
        />
      )}
    </div>
  );
}
