import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  Clapperboard,
  Clock3,
  Film,
  FolderOpen,
  LayoutGrid,
  LoaderCircle,
  Plus,
  Scissors,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  listProjects,
  mediaUrl,
  retryProject,
  saveSelection,
  uploadVideo,
  type Project,
} from "./api";
import { formatTime, validateVideo, validSelection } from "./media";

type Direction = "guided" | "library" | "studio";
const directions: { id: Direction; name: string; detail: string }[] = [
  {
    id: "guided",
    name: "01 / Guided",
    detail:
      "One clear next step. A welcoming upload screen, then a focused editor.",
  },
  {
    id: "library",
    name: "02 / Library",
    detail:
      "A project-first dashboard for creators returning with more videos.",
  },
  {
    id: "studio",
    name: "03 / Studio",
    detail:
      "An editing-first workspace for creators comfortable with a timeline.",
  },
];

export function App() {
  const params = new URLSearchParams(window.location.search);
  const initial = params.get("design");
  const [direction, setDirection] = useState<Direction>(
    initial === "library" || initial === "studio" ? initial : "guided",
  );
  const [review, setReview] = useState(params.has("review"));
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState<"home" | "library">(
    initial === "library" ? "library" : "home",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const refresh = async () => {
    try {
      setProjects(await listProjects());
      setOnline(true);
    } catch {
      setOnline(false);
    }
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => {
      window.clearInterval(timer);
      uploadController.current?.abort();
    };
  }, []);
  const project = projects.find((p) => p.id === selected);

  const importVideo = async (file?: File) => {
    if (!file || busy) return;
    const invalid = validateVideo(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError("");
    setBusy(true);
    setProgress(0);
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const p = await uploadVideo(file, setProgress, controller.signal);
      setProjects((current) => [p, ...current]);
      setSelected(p.id);
      setPage("home");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      uploadController.current = null;
      if (input.current) input.current.value = "";
    }
  };
  const choose = () => input.current?.click();
  const shown = projects.filter((p) =>
    p.filename.toLowerCase().includes(query.toLowerCase()),
  );
  const changeDirection = (id: Direction) => {
    setDirection(id);
    setReview(false);
    setSelected(null);
    setPage(id === "library" ? "library" : "home");
    window.history.replaceState(null, "", "?design=" + id);
  };

  if (review)
    return (
      <div className="design-review">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Scissors size={20} />
          </span>
          SmartClipper
        </a>
        <p className="eyebrow">DESIGN EXPLORATION / 01</p>
        <h1>Three ways to find your next short.</h1>
        <p className="review-intro">
          Explore each direction with the same working import and project
          storage. The guided direction is the recommended starting point.
        </p>
        <div className="direction-grid">
          {directions.map((d) => (
            <button
              className={"direction-card " + d.id}
              key={d.id}
              onClick={() => changeDirection(d.id)}
            >
              <div className="mini-screen">
                <div className="mini-side" />
                <div className="mini-body">
                  <div className="mini-line" />
                  <div className="mini-panel" />
                  <div className="mini-row">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
              <span className="eyebrow">{d.name}</span>
              <h2>
                {d.id === "guided"
                  ? "Start with a story"
                  : d.id === "library"
                    ? "Your creative library"
                    : "Make the cut"}
              </h2>
              <p>{d.detail}</p>
              <span className="link-text">
                Open prototype <ArrowRight size={16} />
              </span>
              {d.id === "guided" && (
                <span className="recommended">Recommended</span>
              )}
            </button>
          ))}
        </div>
        <p className="muted">
          Local review build · AI suggestions and short rendering are next
          milestones.
        </p>
      </div>
    );

  return (
    <div className={"app-shell " + direction}>
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Scissors size={20} />
          </span>
          SmartClipper<span className="beta">ALPHA</span>
        </a>
        <button
          className="primary new-project"
          onClick={choose}
          disabled={busy}
        >
          <Plus size={18} />
          New project
        </button>
        <nav aria-label="Main navigation">
          <button
            className={page === "home" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setPage("home");
              setSelected(null);
            }}
          >
            <LayoutGrid size={18} />
            Overview
          </button>
          <button
            className={page === "library" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setPage("library");
              setSelected(null);
            }}
          >
            <FolderOpen size={18} />
            My videos<span>{projects.length}</span>
          </button>
        </nav>
        <div className="recent-label">RECENT PROJECTS</div>
        <div className="recent-list">
          {projects.slice(0, 4).map((p) => (
            <button
              key={p.id}
              className="recent-project"
              onClick={() => {
                setSelected(p.id);
                setPage("home");
              }}
            >
              <Film size={15} />
              <span>{p.filename}</span>
            </button>
          ))}
          {!projects.length && <p>Your stories will appear here.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="feedback-card">
            <Sparkles size={19} />
            <strong>A little less editing.</strong>
            <p>A little more creating.</p>
          </div>
          <button className="design-link" onClick={() => setReview(true)}>
            Explore 3 UI directions <ArrowRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar">Y</span>
            <div>
              <strong>Your workspace</strong>
              <small>Local review</small>
            </div>
            <span
              className={"status-dot " + (online ? "online" : "")}
              title={online ? "API connected" : "API offline"}
            />
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace
            <ChevronRight size={14} />
            <strong>
              {project
                ? "Video editor"
                : page === "library"
                  ? "My videos"
                  : "Overview"}
            </strong>
          </div>
          <span className="build-tag">EARLY ACCESS</span>
        </header>
        {online === false && (
          <div className="notice" role="status">
            Start the local API to import videos and load saved projects. You
            can still explore the UI.
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {project ? (
          <Editor
            key={project.id}
            project={project}
            onSaved={(p) =>
              setProjects((current) =>
                current.map((item) => (item.id === p.id ? p : item)),
              )
            }
            onError={setError}
          />
        ) : (
          <>
            <section className="page-heading">
              <div>
                <p className="eyebrow">YOUR CREATIVE WORKSPACE</p>
                <h1>
                  {page === "library" || direction === "library"
                    ? "Your videos, all in one place."
                    : direction === "studio"
                      ? "Ready when inspiration strikes."
                      : "Long story. Short format."}
                </h1>
                <p>
                  {page === "library"
                    ? "Pick up where you left off, or bring in something new."
                    : "Bring your video. Find the moments worth sharing."}
                </p>
              </div>
            </section>
            {direction === "library" && (
              <div className="library-stats">
                <div>
                  <span>VIDEOS IMPORTED</span>
                  <strong>{projects.length}</strong>
                  <FolderOpen size={19} />
                </div>
                <div>
                  <span>READY TO REVIEW</span>
                  <strong>
                    {projects.filter((p) => p.status === "ready").length}
                  </strong>
                  <Check size={19} />
                </div>
                <div>
                  <span>IN PREPARATION</span>
                  <strong>
                    {
                      projects.filter((p) =>
                        ["queued", "processing"].includes(p.status),
                      ).length
                    }
                  </strong>
                  <Clock3 size={19} />
                </div>
              </div>
            )}
            {(page !== "library" ||
              projects.length === 0 ||
              direction === "library") && (
              <section className="import-layout">
                <div
                  className="upload-card"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void importVideo(e.dataTransfer.files[0]);
                  }}
                >
                  <div className="upload-symbol">
                    <Upload size={28} />
                  </div>
                  <h2>
                    {busy ? "Bringing your video in…" : "Drop your video here"}
                  </h2>
                  <p>
                    {busy
                      ? progress === 100
                        ? "Saving your upload. Preparation begins next."
                        : progress + "% uploaded"
                      : "A podcast, a conversation, an idea. Start with an MP4."}
                  </p>
                  {busy ? (
                    <>
                      <progress
                        aria-label="Upload progress"
                        value={progress}
                        max={100}
                      />
                      <button
                        className="secondary"
                        onClick={() => uploadController.current?.abort()}
                      >
                        Cancel upload
                      </button>
                    </>
                  ) : (
                    <button className="primary" onClick={choose}>
                      <Plus size={17} />
                      Choose video
                    </button>
                  )}
                  <small>
                    MP4 · up to 200 MB · up to 30 minutes in this review build
                  </small>
                </div>
                <div className="story-card">
                  <span className="eyebrow">FROM RECORDING TO READY</span>
                  <h2>
                    Less time scrubbing.
                    <br />
                    More time creating.
                  </h2>
                  <div className="story-visual" aria-hidden="true">
                    <div className="visual-label">
                      <Clapperboard size={16} />
                      Your next great moment
                    </div>
                    <div className="waveform">
                      {Array.from({ length: 37 }, (_, i) => (
                        <i
                          key={i}
                          style={{ height: 15 + ((i * 19) % 63) + "%" }}
                        />
                      ))}
                    </div>
                    <div className="visual-selection" />
                    <span className="visual-time">00:12 — 00:48</span>
                  </div>
                  <p>
                    Preview your video and mark a strong moment on the timeline.
                    Context-aware suggestions are coming next.
                  </p>
                </div>
              </section>
            )}
            {direction === "studio" && (
              <section className="empty-timeline">
                <Film size={24} />
                <p>Import a video to open the preview and timeline.</p>
                <div className="timeline-ruler">
                  <span>00:00</span>
                  <span>00:15</span>
                  <span>00:30</span>
                  <span>00:45</span>
                </div>
              </section>
            )}
            <section className="projects-section">
              <div className="section-head">
                <div>
                  <h2>
                    {page === "library" ? "All projects" : "Recent projects"}
                    <span className="count">{projects.length}</span>
                  </h2>
                  <p>Your original video stays intact.</p>
                </div>
                {projects.length > 0 && (
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search videos"
                      placeholder="Search videos"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                )}
              </div>
              {!projects.length ? (
                <div className="empty-projects">
                  <span>
                    <FolderOpen size={22} />
                  </span>
                  <div>
                    <strong>A fresh start for your best moments.</strong>
                    <p>Your imported videos will be saved here.</p>
                  </div>
                  <button className="text-button" onClick={choose}>
                    Import your first video
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="project-grid">
                  {shown.map((p) => (
                    <button
                      className="project-card"
                      key={p.id}
                      onClick={() => {
                        setSelected(p.id);
                        setPage("home");
                      }}
                    >
                      <div className="project-thumbnail">
                        {p.status === "ready" ? (
                          <img alt="" src={mediaUrl(p.id, "thumbnail")} />
                        ) : (
                          <Film size={28} />
                        )}
                        <span className={"project-status " + p.status}>
                          {p.status === "ready"
                            ? "Ready to review"
                            : p.status === "failed"
                              ? "Needs attention"
                              : p.status === "processing"
                                ? "Preparing"
                                : "Queued"}
                        </span>
                      </div>
                      <strong>{p.filename}</strong>
                      <p>
                        <Clock3 size={14} />
                        {p.duration_seconds
                          ? formatTime(p.duration_seconds)
                          : "Awaiting preparation"}
                        <span>·</span>
                        {(p.size_bytes / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {projects.length > 0 && !shown.length && (
                <p className="muted">No videos match your search.</p>
              )}
            </section>
            <footer className="page-footer">
              <span>
                <Check size={14} />
                Originals stay untouched
              </span>
              <span>Made for the moments that matter.</span>
            </footer>
          </>
        )}
        <input
          ref={input}
          className="file-input"
          type="file"
          accept="video/mp4,.mp4"
          aria-label="Import video file"
          onChange={(e) => void importVideo(e.target.files?.[0])}
        />
      </main>
    </div>
  );
}

function Editor({
  project: p,
  onSaved,
  onError,
}: {
  project: Project;
  onSaved: (p: Project) => void;
  onError: (s: string) => void;
}) {
  const [start, setStart] = useState(p.start_ms / 1000);
  const [end, setEnd] = useState(p.end_ms / 1000);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editRevision, setEditRevision] = useState(p.revision);
  const video = useRef<HTMLVideoElement>(null);
  const duration = p.duration_seconds ?? 0;
  const save = async () => {
    if (!validSelection(start, end, duration)) {
      onError("Choose an end after the start, within the video.");
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      onSaved(
        await saveSelection(
          { ...p, revision: editRevision },
          Math.round(start * 1000),
          Math.round(end * 1000),
        ),
      );
      setEditRevision(editRevision + 1);
      setSaved(true);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const seek = (time: number) => {
    if (video.current) video.current.currentTime = time;
  };
  const bounds = p.end_ms;
  useEffect(() => {
    // Preserve edits when another tab saves; the API will return a revision conflict.
    if (p.revision === editRevision) {
      setStart(p.start_ms / 1000);
      setEnd(bounds / 1000);
    }
  }, [p.id, p.start_ms, bounds]);
  return (
    <div className="editor">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">VIDEO WORKSPACE</p>
          <h1>{p.filename}</h1>
          <p>
            {duration
              ? formatTime(duration) + " · " + p.width + " × " + p.height
              : "Getting your video ready to review."}
          </p>
        </div>
        {p.status === "ready" && p.has_audio && (
          <a className="secondary" href={mediaUrl(p.id, "audio")} download>
            <ArrowDownToLine size={16} />
            Download MP3
          </a>
        )}
      </div>
      {p.status !== "ready" ? (
        <div className="preparing-panel">
          {p.status === "failed" ? (
            <Film size={34} />
          ) : (
            <LoaderCircle size={34} className="spin" />
          )}
          <h2>
            {p.status === "failed"
              ? "Let’s try that again."
              : p.status === "queued"
                ? "Your video is in the queue."
                : "Preparing your video."}
          </h2>
          <p>
            {p.error ||
              "Creating a browser preview and extracting audio. This continues when you close the tab."}
          </p>
          {p.status === "queued" && (
            <small>Run the local worker if this stays queued.</small>
          )}
          {p.status === "failed" && (
            <button
              className="primary"
              onClick={() =>
                void retryProject(p.id)
                  .then(onSaved)
                  .catch((e) => onError(e.message))
              }
            >
              Retry preparation
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="editor-layout">
            <section className="preview-panel">
              <div className="panel-header">
                <span>
                  <Film size={16} />
                  Source preview
                </span>
                <span className="pill">Original safe</span>
              </div>
              <video
                ref={video}
                controls
                preload="metadata"
                src={mediaUrl(p.id, "preview")}
                aria-label="Video preview"
              />
              <div className="preview-note">
                <Check size={14} />
                This preview uses the source timeline.
              </div>
            </section>
            <aside className="selection-panel">
              <span className="eyebrow">YOUR FIRST CUT</span>
              <h2>Find a complete thought.</h2>
              <p>
                Choose a clear opening and an ending that lands. Save the range
                to return to it later.
              </p>
              <label>
                Start{" "}
                <div className="time-input">
                  <input
                    aria-label="Selection start seconds"
                    type="number"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={start}
                    onChange={(e) => {
                      setStart(Number(e.target.value));
                      setSaved(false);
                    }}
                  />
                  <span>seconds</span>
                </div>
              </label>
              <label>
                End{" "}
                <div className="time-input">
                  <input
                    aria-label="Selection end seconds"
                    type="number"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={end}
                    onChange={(e) => {
                      setEnd(Number(e.target.value));
                      setSaved(false);
                    }}
                  />
                  <span>seconds</span>
                </div>
              </label>
              <div className="selection-duration">
                <Clock3 size={16} />
                {formatTime(Math.max(0, end - start))} selected
              </div>
              <button
                className="primary"
                disabled={saving || !validSelection(start, end, duration)}
                onClick={() => void save()}
              >
                {saving ? (
                  <LoaderCircle size={16} className="spin" />
                ) : saved ? (
                  <Check size={16} />
                ) : (
                  <Scissors size={16} />
                )}
                {saving
                  ? "Saving…"
                  : saved
                    ? "Selection saved"
                    : "Save selection"}
              </button>
              <button
                className="secondary"
                onClick={() => {
                  seek(start);
                  void video.current?.play().catch(() => {});
                }}
              >
                Play from selection
              </button>
              <div className="coming-next">
                <Sparkles size={17} />
                <div>
                  <strong>Up next: smart suggestions</strong>
                  <p>
                    Transcripts, context-aware clips, captions, and MP4 short
                    exports are planned next.
                  </p>
                </div>
              </div>
            </aside>
          </div>
          <section className="timeline-panel">
            <div className="panel-header">
              <span>
                <Scissors size={16} />
                Timeline selection
              </span>
              <strong>
                {formatTime(start)} — {formatTime(end)}
              </strong>
            </div>
            <div className="timeline-ruler">
              <span>00:00</span>
              <span>{formatTime(duration / 4)}</span>
              <span>{formatTime(duration / 2)}</span>
              <span>{formatTime((duration * 3) / 4)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div className="timeline-track">
              <div
                className="selected-range"
                style={{
                  left: (start / duration) * 100 + "%",
                  width: (Math.max(0, end - start) / duration) * 100 + "%",
                }}
              />
            </div>
            <label className="range-label">
              Start{" "}
              <input
                type="range"
                aria-label="Timeline start"
                min={0}
                max={duration}
                step={0.1}
                value={start}
                onChange={(e) => {
                  setStart(Number(e.target.value));
                  seek(Number(e.target.value));
                  setSaved(false);
                }}
              />
            </label>
            <label className="range-label">
              End{" "}
              <input
                type="range"
                aria-label="Timeline end"
                min={0}
                max={duration}
                step={0.1}
                value={end}
                onChange={(e) => {
                  setEnd(Number(e.target.value));
                  setSaved(false);
                }}
              />
            </label>
          </section>
        </>
      )}
    </div>
  );
}
