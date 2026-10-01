import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Captions,
  Check,
  Download,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Play,
  X,
  Save,
  Sparkles,
} from "lucide-react";
import * as api from "./api";
import { navigate } from "./App";
import { formatTime } from "./media";
import { useAuthGate } from "./AuthGate";
import { ProgressRing } from "./ProgressRing";
import { AudioStudio, normalizeAudio, previewAudio } from "./AudioStudio";
import {
  EditedVideoPlayer,
  FramingToggle,
  VideoEditor,
  normalizeEdits,
  validTrim,
} from "./VideoEditor";

function CaptionPlayer({ short }: { short: api.Short }) {
  const [groups, setGroups] = useState<api.CaptionGroup[]>([]);
  const [captionError, setCaptionError] = useState("");
  useEffect(() => {
    let alive = true;
    setGroups([]);
    setCaptionError("");
    if (short.subtitles) {
      Promise.resolve(api.captionData(short.id, short.subtitle_language))
        .then((data) => {
          if (alive && data) setGroups(data.groups);
        })
        .catch(() => {
          if (alive)
            setCaptionError(
              "Captions could not load. Try reopening this short.",
            );
        });
    }
    return () => {
      alive = false;
    };
  }, [short.id, short.subtitle_language, short.revision, short.subtitles]);
  const edits = normalizeEdits(short.video_edits);
  const durationMs = short.end_ms - short.start_ms;
  const start = (short.start_ms + edits.trim_start_ms) / 1000;
  const end = (short.start_ms + (edits.trim_end_ms ?? durationMs)) / 1000;
  return (
    <>
      <EditedVideoPlayer
        audioTracks={previewAudio(short)}
        src={api.mediaUrl(short.project_id, "preview")}
        edits={edits}
        start={start}
        end={end}
        label="Short preview"
        captions={(sourceTime) => {
          const relativeTime = sourceTime - short.start_ms / 1000;
          const cue = groups.find(
            (g) => relativeTime >= g.start && relativeTime < g.end,
          );
          if (!short.subtitles || !cue) return null;
          return (
            <div
              className={`styled-caption caption-${short.caption_style || "pop"} caption-${short.caption_position || "lower"}`}
              dir="auto"
            >
              {cue.words.length
                ? cue.words.map((word, i) => (
                    <span
                      key={i}
                      className={
                        relativeTime >= word.start && relativeTime < word.end
                          ? "spoken"
                          : ""
                      }
                    >
                      {word.text}{" "}
                    </span>
                  ))
                : cue.text}
            </div>
          );
        }}
      />
      {captionError && !!short.subtitles && (
        <p role="status" className="hint">
          {captionError}
        </p>
      )}
    </>
  );
}

function CaptionEditor({
  short,
  resolveShort,
  onSaved,
  onError,
}: {
  short: api.Short;
  resolveShort: () => Promise<api.Short | null>;
  onSaved: (short: api.Short) => void;
  onError: (e: unknown) => void;
}) {
  const [rows, setRows] = useState<api.Caption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = async () => {
    if (loaded) return;
    try {
      setRows(
        (await api.captionData(short.id, short.subtitle_language)).segments,
      );
      setLoaded(true);
    } catch (e) {
      onError(e);
    }
  };
  return (
    <details
      className="caption-editor"
      onToggle={(e) => {
        if (e.currentTarget.open) void load();
      }}
    >
      <summary>Review & correct transcript</summary>
      <p className="hint">
        Correct names, slang or uncertain words. [beep] means a possible tone;
        missing or muted speech cannot be reconstructed. Edited lines keep
        phrase timing and lose automatic word highlighting.
      </p>
      {rows.map((cue, i) => (
        <label key={i} className={cue.review ? "caption-review" : ""}>
          <span>
            {formatTime(cue.start)}–{formatTime(cue.end)}{" "}
            {cue.review && "· Review this line"}
          </span>
          <textarea
            dir="auto"
            maxLength={500}
            rows={2}
            value={cue.text}
            onChange={(e) =>
              setRows((old) =>
                old.map((c, j) =>
                  j === i ? { ...c, text: e.target.value } : c,
                ),
              )
            }
          />
        </label>
      ))}
      <button
        className="secondary"
        disabled={!loaded || busy || rows.some((r) => !r.text.trim())}
        onClick={async () => {
          setBusy(true);
          try {
            const latest = await resolveShort();
            if (!latest) return;
            const saved = await api.saveCaptions(
              latest,
              short.subtitle_language,
              rows,
            );
            onSaved(saved);
            setNotice(
              "Transcript saved. Preview and your next export use these corrections.",
            );
          } catch (e) {
            onError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Save size={15} /> Save transcript
      </button>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
    </details>
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
        loading="lazy"
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
  index = 0,
  initialEditing = true,
  previewActive = true,
  onActivate = () => {},
}: {
  short: api.Short;
  jobs: api.Job[];
  onSaved: (short: api.Short) => void;
  refresh: () => Promise<void>;
  onError: (e: unknown) => void;
  index?: number;
  initialEditing?: boolean;
  previewActive?: boolean;
  onActivate?: () => void;
}) {
  const [draft, setDraft] = useState(short);
  const [editing, setEditing] = useState(initialEditing);
  const previous = useRef(short);
  const edits = normalizeEdits(draft.video_edits);
  const durationMs = short.end_ms - short.start_ms;
  const trimValid = validTrim(edits, durationMs);
  const setEdits = (value: api.VideoEdits) => {
    setDraft({ ...draft, video_edits: value });
    setSaved(false);
    onActivate();
  };
  const { isGuest, requestSignIn } = useAuthGate();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [captionNotice, setCaptionNotice] = useState("");
  const editable = (value: api.Short) => [
    value.title,
    value.subtitles,
    value.subtitle_language,
    value.caption_style,
    value.caption_position,
    value.music,
    value.thumbnail,
    value.thumbnail_style,
    value.thumbnail_text,
    normalizeEdits(value.video_edits),
    normalizeAudio(value.audio_edits),
  ];
  const dirty =
    JSON.stringify(editable(draft)) !== JSON.stringify(editable(short));
  useEffect(() => {
    const previousShort = previous.current;
    setDraft((current) =>
      JSON.stringify(editable(current)) ===
      JSON.stringify(editable(previousShort))
        ? short
        : current,
    );
    previous.current = short;
  }, [short]);
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
    if (!trimValid) return null;
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
    if (!trimValid) return;
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
  async function editCover() {
    if (dirty && !(await save())) return;
    navigate(`/projects/${short.project_id}/shorts?thumbnail=${short.id}`);
  }
  return (
    <article
      className={`short-card ${editing ? "is-editing" : ""}`}
      aria-label={`Short ${index + 1}`}
    >
      <header className="short-card-heading">
        <span className="short-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <h2 dir="auto">{short.title}</h2>
          <p>
            {formatTime((short.start_ms + edits.trim_start_ms) / 1000)}–
            {formatTime(
              (short.start_ms + (edits.trim_end_ms ?? durationMs)) / 1000,
            )}{" "}
            in original ·{" "}
            {formatTime(
              ((edits.trim_end_ms ?? durationMs) - edits.trim_start_ms) /
                1000 /
                edits.speed,
            )}{" "}
            short
          </p>
        </div>
        <button
          className="secondary edit-short-button"
          aria-label={`${editing ? "Close editor for" : "Edit"} short ${index + 1}`}
          aria-expanded={editing}
          onClick={() => {
            setEditing(!editing);
            onActivate();
          }}
        >
          {editing ? <X size={16} /> : <Pencil size={16} />}{" "}
          {editing ? "Close editor" : "Edit short"}
        </button>
      </header>
      <div className="clip-grid">
        <section className="clip-preview card">
          <div className="preview-heading">
            <span>
              <Sparkles size={15} /> SUGGESTED SHORT
            </span>
            <span>
              {formatTime(
                ((edits.trim_end_ms ?? durationMs) - edits.trim_start_ms) /
                  1000 /
                  edits.speed,
              )}{" "}
              · {edits.framing === "horizontal" ? "16:9" : "9:16"}
            </span>
          </div>
          <FramingToggle value={edits} onChange={setEdits} />
          {previewActive ? (
            <CaptionPlayer short={draft} />
          ) : (
            <button
              className={`short-poster ${edits.framing}`}
              onClick={onActivate}
              aria-label={`Preview short ${index + 1}`}
            >
              {short.thumbnails.length || short.thumbnail === 3 ? (
                <Cover short={draft} index={draft.thumbnail} />
              ) : (
                <span>No cover available</span>
              )}
              <span className="preview-play">
                <Play size={19} /> Preview this short
              </span>
            </button>
          )}
          {!editing && (
            <div className="short-quick-actions">
              <button
                className="secondary quick-edit-button"
                onClick={() => {
                  setEditing(true);
                  onActivate();
                }}
              >
                <Pencil size={14} /> Trim & adjust
              </button>
              <button
                className="secondary quick-cover-button"
                disabled={busy || stale || !trimValid}
                onClick={() => void editCover()}
              >
                <ImagePlus size={14} /> Edit cover
              </button>
            </div>
          )}
          <div className="player-footer">
            <span>
              <Captions size={16} />{" "}
              {draft.subtitles ? "Captions on" : "Captions off"}
            </span>
            <span>Fast preview · HD download</span>
          </div>
        </section>
        <section className="clip-details">
          <details
            className="card context-card moment-context"
            open={editing ? true : undefined}
          >
            <summary>What’s in this moment?</summary>
            <span className="step-label">THE STORY IN THIS CUT</span>

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
          </details>
          {!editing && (
            <div className="card quick-cover-card">
              <h3>Pick your cover</h3>
              <div className="thumbnail-options">
                {short.thumbnails.map((t) => (
                  <button
                    key={t.index}
                    className={draft.thumbnail === t.index ? "chosen" : ""}
                    aria-label={`Choose thumbnail ${t.index + 1} for short ${index + 1}`}
                    aria-pressed={draft.thumbnail === t.index}
                    onClick={() => setDraft({ ...draft, thumbnail: t.index })}
                  >
                    <Cover short={draft} index={t.index} />
                    {t.index === 0 && (
                      <span className="recommended-cover">Recommended</span>
                    )}
                  </button>
                ))}
              </div>
              <p className="hint">
                Choose a clear first impression, or edit your cover.
              </p>
            </div>
          )}
          {editing && (
            <div className="card customize-card">
              <div className="section-heading">
                <h2>Make it yours.</h2>
                <span className="quiet-badge">Small tweaks. Your style.</span>
              </div>
              {stale && (
                <div className="notice">
                  This short was updated in another tab.{" "}
                  <button
                    className="text-button"
                    onClick={() => setDraft(short)}
                  >
                    Load latest version
                  </button>
                </div>
              )}
              <VideoEditor
                value={edits}
                durationMs={durationMs}
                onChange={setEdits}
              />
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
              <button
                className={draft.subtitles ? "secondary wide" : "primary wide"}
                onClick={() => setDraft({ ...draft, subtitles: true })}
              >
                <Captions size={17} />{" "}
                {draft.subtitles
                  ? "Styled subtitles on"
                  : "Add styled subtitles"}
              </button>
              {!!draft.subtitles && (
                <div className="caption-controls">
                  <label>
                    Caption style
                    <select
                      value={draft.caption_style || "pop"}
                      onChange={(e) =>
                        setDraft({ ...draft, caption_style: e.target.value })
                      }
                    >
                      <option value="pop">Pop · lime spoken word</option>
                      <option value="karaoke">
                        Karaoke · golden spoken word
                      </option>
                      <option value="clean">Clean · white phrases</option>
                    </select>
                  </label>
                  <label>
                    Caption position
                    <select
                      value={draft.caption_position || "lower"}
                      onChange={(e) =>
                        setDraft({ ...draft, caption_position: e.target.value })
                      }
                    >
                      <option value="lower">Lower · above app controls</option>
                      <option value="middle">Middle</option>
                    </select>
                  </label>
                </div>
              )}
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
              <CaptionEditor
                key={`${short.id}:${draft.subtitle_language}:${short.revision}`}
                short={draft}
                resolveShort={() => (dirty ? save() : Promise.resolve(draft))}
                onSaved={(s) => {
                  setDraft(s);
                  onSaved(s);
                  setCaptionNotice(
                    "Transcript saved. Your preview and next export use these corrections.",
                  );
                }}
                onError={onError}
              />
              {captionNotice && (
                <p role="status" className="notice">
                  {captionNotice}
                </p>
              )}
              <AudioStudio
                short={draft}
                onChange={setDraft}
                onActivate={onActivate}
                onError={onError}
              />
              <div className="thumbnail-section">
                <div className="section-heading">
                  <h3>The first impression.</h3>
                  <button
                    className="text-button"
                    disabled={busy || stale || !trimValid}
                    onClick={() => void editCover()}
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
                      {t.index === 0 && (
                        <span className="recommended-cover">Recommended</span>
                      )}
                      <span className="sr-only">
                        {t.reason}. {t.framing}
                      </span>
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
                    No cover frame passed the quality check. Upload your own
                    cover in the editor.
                  </p>
                )}
                <p className="hint">
                  Clear frame choices with your title. Edit the text, change the
                  style, or upload a cover.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
      <footer className="short-card-actions">
        {" "}
        {activeExport && (
          <ProgressRing
            compact
            value={activeExport.progress || 0}
            label={activeExport.stage}
          />
        )}
        {dirty && (
          <p role="status" className="hint">
            You have unapplied changes. Apply them to keep this version.
          </p>
        )}
        <div className="action-row">
          <button
            className="secondary"
            disabled={
              busy || stale || !dirty || !trimValid || !draft.title.trim()
            }
            onClick={() => void save()}
          >
            <Save size={16} />
            {saved && !dirty ? "Changes applied" : "Apply changes"}
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              !!activeExport ||
              stale ||
              !trimValid ||
              !draft.title.trim()
            }
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
          {dirty && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setDraft(short);
                setSaved(false);
              }}
            >
              Discard changes
            </button>
          )}
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
      </footer>
    </article>
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
    if (!draft) return;
    if (isGuest) {
      setBusy(true);
      try {
        const saved = await api.saveShort(draft);
        setDraft(saved);
        requestSignIn();
      } catch (error) {
        onError(error);
      } finally {
        setBusy(false);
      }
      return;
    }
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
