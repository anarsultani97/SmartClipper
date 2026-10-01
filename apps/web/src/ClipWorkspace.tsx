import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Captions,
  Check,
  Download,
  ImagePlus,
  LoaderCircle,
  Music2,
  Save,
  Sparkles,
} from "lucide-react";
import * as api from "./api";
import { navigate } from "./App";
import { formatTime } from "./media";
import { useAuthGate } from "./AuthGate";

function CaptionPlayer({ short }: { short: api.Short }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const update = () => {
      const player = video.current;
      if (!player) return;
      for (const track of Array.from(player.textTracks))
        track.mode = short.subtitles ? "showing" : "disabled";
    };
    update();
    const player = video.current;
    player?.addEventListener("loadedmetadata", update);
    return () => player?.removeEventListener("loadedmetadata", update);
  }, [short.subtitles, short.subtitle_language]);
  return (
    <video
      ref={video}
      controls
      preload="metadata"
      src={api.shortMedia(short.id, "clip")}
    >
      <track
        key={short.subtitle_language}
        kind="subtitles"
        label={
          short.subtitle_language === "en" ? "English" : "Original language"
        }
        srcLang={short.subtitle_language === "en" ? "en" : undefined}
        src={api.captionsUrl(short.id, short.subtitle_language)}
        default={!!short.subtitles}
        onLoad={() => {
          if (video.current?.textTracks[0])
            video.current.textTracks[0].mode = short.subtitles
              ? "showing"
              : "disabled";
        }}
      />
    </video>
  );
}

export function Cover({
  short,
  index,
  large = false,
}: {
  short: api.Short;
  index: number;
  large?: boolean;
}) {
  return (
    <div
      className={`cover cover-${short.thumbnail_style} ${large ? "cover-large" : ""}`}
    >
      <img
        src={
          api.shortMedia(short.id, `thumbnail-${index}`) +
          `?v=${short.revision}`
        }
        alt={`Thumbnail ${index === 3 ? "uploaded by you" : index + 1}`}
      />
      <span dir="auto">{short.thumbnail_text || short.title}</span>
    </div>
  );
}

export function ClipWorkspace({
  short,
  jobs,
  onSaved,
  refresh,
  onError,
}: {
  short: api.Short;
  jobs: api.Job[];
  onSaved: (short: api.Short) => void;
  refresh: () => Promise<void>;
  onError: (e: unknown) => void;
}) {
  const [draft, setDraft] = useState(short);
  const { isGuest, requestSignIn } = useAuthGate();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const editable = (value: api.Short) => [
    value.title,
    value.subtitles,
    value.subtitle_language,
    value.music,
    value.thumbnail,
    value.thumbnail_style,
    value.thumbnail_text,
  ];
  const dirty =
    JSON.stringify(editable(draft)) !== JSON.stringify(editable(short));
  const stale = draft.revision !== short.revision;
  const activeExport = jobs.find(
    (j) =>
      j.kind === "export" &&
      j.options.short_id === short.id &&
      ["queued", "processing"].includes(j.status),
  );
  const exportJob = jobs.find(
    (j) =>
      j.kind === "export" &&
      j.options.short_id === short.id &&
      j.status === "ready" &&
      j.options.revision === short.revision,
  );
  const failedExport =
    jobs.find((j) => j.kind === "export" && j.options.short_id === short.id)
      ?.status === "failed";
  async function save() {
    setBusy(true);
    try {
      const result = await api.saveShort(draft);
      setDraft(result);
      onSaved(result);
      setSaved(true);
      return result;
    } catch (e) {
      onError(e);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function render() {
    setBusy(true);
    try {
      const result = dirty ? await api.saveShort(draft) : short;
      setDraft(result);
      onSaved(result);
      if (isGuest) {
        requestSignIn();
        return;
      }
      await api.exportShort(short.id);
      await refresh();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="clip-grid">
      <section className="clip-preview card">
        <div className="preview-heading">
          <span>
            <Sparkles size={15} /> SUGGESTED SHORT
          </span>
          <span>
            {formatTime((short.end_ms - short.start_ms) / 1000)} · 9:16
          </span>
        </div>
        <CaptionPlayer short={draft} />
        <div className="player-footer">
          <span>
            <Captions size={16} />{" "}
            {draft.subtitles ? "Captions on" : "Captions off"}
          </span>
          <span>Original audio preview</span>
        </div>
      </section>
      <section className="clip-details">
        <div className="card context-card">
          <span className="step-label">THE STORY IN THIS CUT</span>
          <h2>{short.title}</h2>
          <p className="source-range">
            From {formatTime(short.start_ms / 1000)} to{" "}
            {formatTime(short.end_ms / 1000)} in your original video.
          </p>
          {short.summary.map((line, i) => (
            <p key={i} dir="auto">
              {line}
            </p>
          ))}
          <details>
            <summary>Read the excerpt transcript</summary>
            {short.transcript.map((line, i) => (
              <p key={i} dir="auto">
                {line.text}
              </p>
            ))}
          </details>
          <p className="hint quality-note">{short.quality_note}</p>
        </div>
        <div className="card customize-card">
          <div className="section-heading">
            <h2>Make it yours.</h2>
            <span className="quiet-badge">Small tweaks. Your style.</span>
          </div>
          {stale && (
            <div className="notice">
              This short was updated in another tab.{" "}
              <button className="text-button" onClick={() => setDraft(short)}>
                Load latest version
              </button>
            </div>
          )}
          <label>
            Short title
            <input
              maxLength={100}
              value={draft.title}
              onChange={(e) => {
                setDraft({ ...draft, title: e.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label className="toggle-label">
            <span>
              <Captions size={18} /> Show subtitles
              <small>Preview now; include them in your next export.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={!!draft.subtitles}
              onChange={(e) =>
                setDraft({ ...draft, subtitles: e.target.checked })
              }
            />
          </label>
          <label>
            Subtitle language
            <select
              value={draft.subtitle_language}
              onChange={(e) =>
                setDraft({ ...draft, subtitle_language: e.target.value })
              }
            >
              <option value="original">Original language</option>
              {(short.english_available ||
                short.subtitle_language === "en") && (
                <option value="en">English</option>
              )}
            </select>
          </label>
          <label>
            <span>
              <Music2 size={16} /> Music for your export
            </span>
            <select
              value={draft.music}
              onChange={(e) => setDraft({ ...draft, music: e.target.value })}
            >
              <option value="none">Original audio only</option>
              <option value="bright">Little lift · bright</option>
              <option value="calm">Room to think · calm</option>
              <option value="pulse">Keep moving · energetic</option>
            </select>
          </label>
          <p className="hint">
            Original instrumental beds, mixed quietly under your voice. Music is
            applied when you render an export.
          </p>
          <details className="music-discovery">
            <summary>Looking for a trending song?</summary>
            <p>
              Find current music in the platform’s own library, then add it
              there after download. A song’s availability and license can differ
              by region, account, and platform.
            </p>
            <a
              target="_blank"
              rel="noreferrer"
              href="https://ads.tiktok.com/business/creativecenter/music/pc/en"
            >
              Discover TikTok music ↗
            </a>
            <a
              target="_blank"
              rel="noreferrer"
              href="https://support.google.com/youtube/answer/13486873"
            >
              YouTube Shorts music library ↗
            </a>
          </details>
          <div className="thumbnail-section">
            <div className="section-heading">
              <h3>The first impression.</h3>
              <button
                className="text-button"
                onClick={() =>
                  navigate(
                    `/projects/${short.project_id}/shorts?thumbnail=${short.id}`,
                  )
                }
              >
                Edit cover <ImagePlus size={14} />
              </button>
            </div>
            <div className="thumbnail-options">
              {short.thumbnails.map((t) => (
                <button
                  key={t.index}
                  className={draft.thumbnail === t.index ? "chosen" : ""}
                  aria-label={`Choose thumbnail ${t.index + 1}`}
                  aria-pressed={draft.thumbnail === t.index}
                  onClick={() => setDraft({ ...draft, thumbnail: t.index })}
                >
                  <Cover short={draft} index={t.index} />
                  {draft.thumbnail === t.index && (
                    <span className="chosen-mark">
                      <Check size={13} />
                    </span>
                  )}
                </button>
              ))}
              {short.thumbnail === 3 && (
                <button
                  aria-label="Choose uploaded thumbnail"
                  onClick={() => setDraft({ ...draft, thumbnail: 3 })}
                >
                  <Cover short={draft} index={3} />
                </button>
              )}
            </div>
            {!short.thumbnails.length && (
              <p className="hint">
                No cover frame passed the quality check. Upload your own cover
                in the editor.
              </p>
            )}
            <p className="hint">
              Clear frame choices with your title. Edit the text, change the
              style, or upload a cover.
            </p>
          </div>
          <div className="action-row">
            <button
              className="secondary"
              disabled={busy || stale || !draft.title.trim()}
              onClick={() => void save()}
            >
              <Save size={16} />
              {saved && !dirty ? "Saved" : "Save changes"}
            </button>
            <button
              className="primary"
              disabled={busy || !!activeExport || stale || !draft.title.trim()}
              onClick={() => void render()}
            >
              {busy || activeExport ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Download size={16} />
              )}{" "}
              {activeExport
                ? "Rendering…"
                : isGuest
                  ? "Sign in to download"
                  : "Render download"}
            </button>
          </div>
          {failedExport && !activeExport && (
            <p role="alert" className="hint">
              The last export failed. Try rendering again.
            </p>
          )}
          {exportJob && !dirty && (
            <a
              className="download-ready"
              href={api.shortMedia(short.id, "export", exportJob.id)}
              onClick={(event) => {
                if (isGuest) {
                  event.preventDefault();
                  requestSignIn();
                }
              }}
            >
              <Check size={16} /> Your MP4 is ready. Download short{" "}
              <Download size={16} />
            </a>
          )}
          <p className="hint">
            Share the downloaded video in your favorite app. Direct publishing
            comes later.
          </p>
        </div>
      </section>
    </div>
  );
}

export function ThumbnailEditor({
  project,
  shortId,
  onError,
}: {
  project: api.Project;
  shortId: string;
  onError: (e: unknown) => void;
}) {
  const [draft, setDraft] = useState<api.Short | null>(null);
  const { isGuest, requestSignIn } = useAuthGate();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const frameVideo = useRef<HTMLVideoElement>(null);
  async function captureFrame() {
    if (!draft || !frameVideo.current || frameVideo.current.readyState < 2)
      return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 1280;
      canvas.getContext("2d")!.drawImage(frameVideo.current, 0, 0, 720, 1280);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("This frame could not be captured.");
      const updated = await api.uploadThumbnail(
        draft,
        new File([blob], "frame.jpg", { type: "image/jpeg" }),
      );
      setDraft({
        ...draft,
        thumbnail: 3,
        revision: updated.revision,
        export_revision: null,
      });
      setStatus("Frame captured. Save to keep your text and style.");
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    api
      .shorts(project.id)
      .then((items) => {
        if (!active) return;
        const found = items.find((s) => s.id === shortId);
        if (found) setDraft(found);
        else onError(new Error("Thumbnail editor not found."));
      })
      .catch((error) => {
        if (active) onError(error);
      });
    return () => {
      active = false;
    };
  }, [project.id, shortId, onError]);
  async function download() {
    if (isGuest) {
      requestSignIn();
      return;
    }
    if (!draft) return;
    try {
      const image = new Image();
      image.src =
        api.shortMedia(draft.id, `thumbnail-${draft.thumbnail}`) +
        `?v=${draft.revision}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, 720, 1280);
      const gradient = ctx.createLinearGradient(0, 720, 0, 1280);
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(1, "rgba(0,0,0,.85)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 720, 720, 560);
      await document.fonts.ready;
      const minimal = draft.thumbnail_style === "minimal";
      ctx.font = minimal
        ? "500 38px Inter, sans-serif"
        : "700 52px Inter, sans-serif";
      ctx.textAlign = minimal ? "left" : "center";
      ctx.fillStyle = draft.thumbnail_style === "bold" ? "#dcff76" : "white";
      const text = draft.thumbnail_text || draft.title;
      const parts = Array.from(text);
      const lines: string[] = [];
      let line = "";
      for (const part of parts) {
        if (ctx.measureText(line + part).width > 620) {
          lines.push(line);
          line = part;
        } else line += part;
      }
      if (line) lines.push(line);
      const shown = lines.slice(0, 4);
      if (minimal) {
        ctx.fillStyle = "rgba(0,0,0,.45)";
        ctx.fillRect(48, 995, 624, shown.length * 48 + 25);
        ctx.fillStyle = "white";
      }
      shown.forEach((value, i) =>
        ctx.fillText(value, minimal ? 58 : 360, 1030 + i * (minimal ? 48 : 64)),
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.94),
      );
      if (!blob) throw new Error("Cover could not be created.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "smartclipper-thumbnail.jpg";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      onError(e);
    }
  }
  if (!draft)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" />
        Opening your cover…
      </div>
    );
  return (
    <>
      <button
        className="back-link"
        onClick={() => navigate(`/projects/${project.id}/shorts`)}
      >
        <ArrowLeft size={16} /> Back to your shorts
      </button>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">A GOOD FIRST IMPRESSION</span>
          <h1>Give your story a cover.</h1>
          <p>A clear frame. A few good words. Your style.</p>
        </div>
      </div>
      <div className="thumbnail-editor">
        <section className="card cover-preview">
          <Cover short={draft} index={draft.thumbnail} large />
        </section>
        <section className="card cover-controls">
          <h2>Simple changes. A stronger cover.</h2>
          <label>
            Cover text
            <textarea
              maxLength={100}
              rows={3}
              dir="auto"
              value={draft.thumbnail_text}
              onChange={(e) =>
                setDraft({ ...draft, thumbnail_text: e.target.value })
              }
            />
          </label>
          <label>
            Text style
            <select
              value={draft.thumbnail_style}
              onChange={(e) =>
                setDraft({ ...draft, thumbnail_style: e.target.value })
              }
            >
              <option value="bold">Bold · lime accent</option>
              <option value="clean">Clean · white title</option>
              <option value="minimal">Minimal · compact label</option>
            </select>
          </label>
          <h3>Choose a clear frame</h3>
          <div className="thumbnail-options">
            {draft.thumbnails.map((t) => (
              <button
                key={t.index}
                aria-label={`Choose thumbnail ${t.index + 1}`}
                aria-pressed={draft.thumbnail === t.index}
                className={draft.thumbnail === t.index ? "chosen" : ""}
                onClick={() => setDraft({ ...draft, thumbnail: t.index })}
              >
                <Cover short={draft} index={t.index} />
              </button>
            ))}
          </div>
          <label className="secondary file-button">
            <ImagePlus size={17} /> Upload your own thumbnail
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload custom thumbnail"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  onError(new Error("Choose an image under 5 MB."));
                  return;
                }
                setBusy(true);
                try {
                  const updated = await api.uploadThumbnail(draft, file);
                  setDraft({
                    ...draft,
                    thumbnail: 3,
                    revision: updated.revision,
                    export_revision: null,
                  });
                  setStatus(
                    "Your image is ready. Save to keep your text and style.",
                  );
                } catch (err) {
                  onError(err);
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
          <p className="hint">
            JPEG, PNG or WebP · up to 5 MB. Your image is fitted to a vertical
            9:16 cover.
          </p>
          <details className="frame-picker">
            <summary>Choose another moment from this short</summary>
            <p className="hint">
              Pause on a clear, well-lit frame. Your choice becomes your custom
              cover.
            </p>
            <video
              ref={frameVideo}
              controls
              preload="metadata"
              src={api.shortMedia(draft.id, "clip")}
            />
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void captureFrame()}
            >
              <ImagePlus size={16} /> Use current frame
            </button>
          </details>
          <div className="action-row">
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setDraft(await api.saveShort(draft));
                  setStatus("Cover saved.");
                } catch (e) {
                  onError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Save size={16} /> Save cover
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void download()}
            >
              <Download size={16} /> Download JPG
            </button>
          </div>
          {status && (
            <p role="status" className="notice">
              {status}
            </p>
          )}
          <p className="hint">
            Download the styled cover separately. The destination platform
            decides where a cover can be uploaded.
          </p>
        </section>
      </div>
    </>
  );
}
