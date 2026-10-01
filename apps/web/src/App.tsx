import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Captions,
  Check,
  ChevronRight,
  Clapperboard,
  Download,
  Film,
  ImagePlus,
  LoaderCircle,
  LogOut,
  Plus,
  Scissors,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles,
  ChartNoAxesCombined,
  X,
} from "lucide-react";
import * as api from "./api";
import { formatTime, validateVideo } from "./media";
import { AuthView } from "./AuthView";
import { ClipWorkspace, ThumbnailEditor } from "./ClipWorkspace";
import { ActivityDashboard } from "./ActivityDashboard";

export const languages = [
  ["en", "English"],
  ["es", "Español"],
  ["zh", "中文"],
  ["hi", "हिन्दी"],
  ["ar", "العربية"],
  ["pt", "Português"],
  ["bn", "বাংলা"],
  ["ru", "Русский"],
  ["ja", "日本語"],
  ["fr", "Français"],
  ["tr", "Türkçe"],
];
export const defaultOptions: api.Options = {
  language: "auto",
  platform: "youtube",
  duration_seconds: 45,
  count: 5,
  english_subtitles: false,
};
export function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";

export function Preferences({
  value,
  onChange,
}: {
  value: api.Options;
  onChange: (value: api.Options) => void;
}) {
  const change = (key: keyof api.Options, input: string | boolean | number) =>
    onChange({ ...value, [key]: input });
  return (
    <div className="preferences">
      <label>
        Video language
        <select
          value={value.language}
          onChange={(e) => change("language", e.target.value)}
        >
          <option value="auto">Auto-detect language</option>
          {languages.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Made for
        <select
          value={value.platform}
          onChange={(e) => change("platform", e.target.value)}
        >
          <option value="youtube">YouTube Shorts</option>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram Reels</option>
          <option value="facebook">Facebook Reels</option>
        </select>
      </label>
      <label>
        Preferred maximum length
        <select
          value={value.duration_seconds}
          onChange={(e) => change("duration_seconds", Number(e.target.value))}
        >
          {[15, 30, 45, 60, 90, 180].map((s) => (
            <option key={s} value={s}>
              {s} seconds
            </option>
          ))}
        </select>
      </label>
      <label>
        Number of suggestions
        <select
          value={value.count}
          onChange={(e) => change("count", Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              Up to {n} shorts
            </option>
          ))}
        </select>
      </label>
      <label className="toggle-label">
        <span>
          <Captions size={18} /> Also create English subtitles
          <small>Translate speech while preserving the original audio.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={value.english_subtitles}
          onChange={(e) => change("english_subtitles", e.target.checked)}
        />
      </label>
      <p className="hint">
        Sentence boundaries may make clips shorter. These are duration
        preferences, not platform upload limits.
      </p>
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<api.User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [projects, setProjects] = useState<api.Project[]>([]);
  const [path, setPath] = useState(
    window.location.pathname + window.location.search,
  );
  const [error, setError] = useState("");
  const [options, setOptions] = useState(defaultOptions);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadingName, setUploadingName] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [highlightedProject, setHighlightedProject] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const removedIds = useRef(new Set<string>());
  const highlightRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const listener = () => {
      setPath(window.location.pathname + window.location.search);
      setError("");
      setNotice("");
    };
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    api
      .currentUser()
      .then((u) => {
        api.setCsrf(u.csrf);
        setUser(u);
      })
      .catch(() => {})
      .finally(() => setAuthReady(true));
    return () => abort.current?.abort();
  }, []);
  const reportError = useCallback((e: unknown) => setError(message(e)), []);
  const refresh = useCallback(async () => {
    try {
      const data = await api.listProjects();
      setProjects(data.filter((p) => !removedIds.current.has(p.id)));
    } catch (e) {
      setError(message(e));
    } finally {
      setLibraryLoaded(true);
    }
  }, []);
  useEffect(() => {
    if (!highlightedProject) return;
    highlightRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
        ? "auto"
        : "smooth",
    });
    const timer = window.setTimeout(() => setHighlightedProject(""), 6000);
    return () => window.clearTimeout(timer);
  }, [highlightedProject]);
  useEffect(() => {
    if (!user) return;
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [user, refresh]);
  async function upload(file?: File) {
    if (!file || progress !== null) return;
    const invalid = validateVideo(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError("");
    setProgress(0);
    setUploadingName(file.name);
    abort.current = new AbortController();
    try {
      const p = await api.uploadVideo(file, setProgress, abort.current.signal);
      setProjects((old) => [p, ...old.filter((v) => v.id !== p.id)]);
      navigate(`/projects/${p.id}`);
      setHighlightedProject(p.id);
      setNotice(
        "Video uploaded! Follow its preparation in Recent videos on the left (above on mobile).",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }
  const selectedId = path.match(/^\/projects\/([^/?]+)/)?.[1];
  const selected = projects.find((p) => p.id === selectedId);
  const inQueue = (p: api.Project) =>
    p.status === "queued" || p.status === "processing";
  const queued = projects.filter(inQueue);
  const recentProjects = [
    ...queued,
    ...projects.filter((p) => !inQueue(p)).slice(0, 8),
  ];
  async function removeVideo(p: api.Project) {
    setDeletingId(p.id);
    try {
      await api.removeQueuedVideo(p.id);
      removedIds.current.add(p.id);
      setProjects((old) => old.filter((video) => video.id !== p.id));
      if (selectedId === p.id) navigate("/");
      setNotice(`${p.filename} was removed from the queue.`);
    } catch (e) {
      reportError(e);
      await refresh();
    } finally {
      setDeletingId("");
    }
  }
  const results = !!selected && path.includes("/shorts");
  const thumbId = new URLSearchParams(path.split("?")[1] || "").get(
    "thumbnail",
  );
  if (!authReady)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!user)
    return (
      <AuthView
        onLogin={(u) => {
          api.setCsrf(u.csrf);
          setUser(u);
        }}
      />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <span className="brand-mark">
            <Scissors size={21} />
          </span>
          SmartClipper<span className="beta">BETA</span>
        </a>
        <button
          className="new-project"
          onClick={() => {
            navigate("/");
            input.current?.click();
          }}
        >
          <Plus size={18} /> New video
        </button>
        <p className="nav-label">YOUR WORKSPACE</p>
        <button
          className={
            !selected && path !== "/activity" ? "nav-item active" : "nav-item"
          }
          onClick={() => navigate("/")}
        >
          <Film size={18} /> My videos
        </button>
        <button
          className={path === "/activity" ? "nav-item active" : "nav-item"}
          onClick={() => navigate("/activity")}
        >
          <ChartNoAxesCombined size={18} /> Activity dashboard
        </button>
        <p className="nav-label recent-heading">
          RECENT VIDEOS <span>{projects.length}</span>
        </p>
        <p className="queue-status" role="status">
          {!libraryLoaded
            ? "Loading your videos…"
            : queued.length
              ? `${queued.length} ${queued.length === 1 ? "video" : "videos"} in the queue. Track preparation here.`
              : "No videos in the queue. You’re all caught up."}
        </p>
        <div className="recent-list">
          {recentProjects.map((p) => (
            <div
              className={`recent-row ${selected?.id === p.id ? "selected" : ""} ${highlightedProject === p.id ? "queue-arrival" : ""}`}
              key={p.id}
              ref={highlightedProject === p.id ? highlightRef : undefined}
            >
              <button
                className="recent-item"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <span className="recent-icon">
                  <Clapperboard size={16} />
                </span>
                <span>
                  {p.filename}
                  <small>
                    {p.status === "ready"
                      ? formatTime(p.duration_seconds || 0)
                      : p.status === "processing"
                        ? "Preparing your video…"
                        : p.status === "queued"
                          ? "Queued for preparation"
                          : p.status}
                  </small>
                </span>
              </button>
              {inQueue(p) && (
                <button
                  className="queue-remove"
                  aria-label={`Remove ${p.filename} from queue`}
                  title="Remove from queue"
                  disabled={!!deletingId}
                  onClick={() => void removeVideo(p)}
                >
                  {deletingId === p.id ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <X size={14} />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="sidebar-note">
          <Sparkles size={19} />
          <p>“Every long story has a short worth sharing.”</p>
          <small>A little editing philosophy.</small>
        </div>
        <div className="profile">
          <span className="avatar">{user.name[0]?.toUpperCase()}</span>
          <span>
            {user.name}
            <small>Your private workspace</small>
          </span>
          <button
            aria-label="Sign out"
            className="icon-button"
            onClick={async () => {
              try {
                await api.logout();
                api.setCsrf("");
                setUser(null);
                setProjects([]);
                removedIds.current.clear();
                setLibraryLoaded(false);
                navigate("/");
              } catch (e) {
                setError(message(e));
              }
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={14} />
            <span>
              {selected
                ? results
                  ? "Your shorts"
                  : "Video workspace"
                : path === "/activity"
                  ? "Activity dashboard"
                  : "My videos"}
            </span>
          </div>
          <span className="quiet-badge">
            <ShieldCheck size={15} /> Yours to review. Yours to share.
          </span>
        </header>
        <input
          ref={input}
          type="file"
          accept="video/mp4,.mp4"
          className="sr-only"
          aria-label="Import video file"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        <div className="content">
          {progress !== null && (
            <section className="upload-progress" aria-live="polite">
              <Upload size={21} />
              <div>
                <div className="upload-progress-label">
                  <strong>
                    {progress === 100
                      ? "Upload transferred. Saving your video…"
                      : `Uploading ${uploadingName}`}
                  </strong>
                  <span>{progress}%</span>
                </div>
                <progress
                  aria-label="Video upload progress"
                  value={progress}
                  max={100}
                />
                <small>
                  Keep this tab open while uploading. Video preparation starts
                  after the transfer.
                </small>
              </div>
              <button
                className="text-button"
                onClick={() => abort.current?.abort()}
              >
                Cancel upload
              </button>
            </section>
          )}
          {error && (
            <div role="alert" className="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              {notice}
            </div>
          )}
          {path === "/activity" ? (
            <ActivityDashboard />
          ) : selected ? (
            results ? (
              thumbId ? (
                <ThumbnailEditor
                  project={selected}
                  shortId={thumbId}
                  onError={reportError}
                />
              ) : (
                <Results project={selected} onError={reportError} />
              )
            ) : (
              <SourceWorkspace
                project={selected}
                options={options}
                setOptions={setOptions}
                refresh={refresh}
                onError={reportError}
                onNotice={setNotice}
              />
            )
          ) : selectedId ? (
            <section className="empty-state">
              <h2>Video unavailable.</h2>
              <p>
                If you just opened this page, your library may still be loading.
              </p>
              <button onClick={() => navigate("/")}>Back to my videos</button>
            </section>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    <Sparkles size={14} /> A LITTLE LESS EDITING. A LOT MORE
                    CREATING.
                  </span>
                  <h1>
                    Long story.
                    <br />
                    <em>Short format.</em>
                  </h1>
                  <p>
                    Find the moments worth sharing.
                    <br />
                    Turn your video into a handful of thoughtful shorts.
                  </p>
                </div>
                <span className="heading-sticker">
                  <Scissors />
                  <span>
                    Keep the story.
                    <br />
                    Skip the scrolling.
                  </span>
                </span>
              </div>
              <section className="import-grid">
                <div
                  className="upload-card"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void upload(e.dataTransfer.files[0]);
                  }}
                >
                  <div className="upload-symbol">
                    <Upload size={30} />
                    <span>
                      <Sparkles size={14} />
                    </span>
                  </div>
                  <h2>Your next short starts here.</h2>
                  <p>Drop your video, or choose one to get started.</p>
                  <button
                    className="primary"
                    disabled={progress !== null}
                    onClick={() => input.current?.click()}
                  >
                    {progress !== null ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <Plus size={18} />
                    )}{" "}
                    {progress !== null
                      ? `Uploading ${progress}%`
                      : "Choose video"}
                  </button>
                  <small>MP4 · up to 3 GB · up to 30 minutes</small>
                  <div className="upload-foot">
                    <Check size={14} /> Original audio stays with your story
                  </div>
                </div>
                <section className="card import-options">
                  <span className="step-label">01 / MAKE IT YOURS</span>
                  <h2>
                    A few preferences.
                    <br />
                    We’ll take it from here.
                  </h2>
                  <Preferences value={options} onChange={setOptions} />
                </section>
              </section>
              <section className="benefit-row">
                <div>
                  <Captions />
                  <h3>Speak your language</h3>
                  <p>
                    Eleven languages, including Turkish, with optional English
                    captions.
                  </p>
                </div>
                <div>
                  <ImagePlus />
                  <h3>A clearer first impression</h3>
                  <p>Quality-checked cover choices, plus your own thumbnail.</p>
                </div>
                <div>
                  <WandSparkles />
                  <h3>Your final say</h3>
                  <p>
                    Preview the context, customize, and download your favorites.
                  </p>
                </div>
              </section>
              <section className="library">
                <div className="section-heading">
                  <h2>
                    Your videos <span>{projects.length}</span>
                  </h2>
                  <input
                    type="search"
                    placeholder="Find a video…"
                    aria-label="Search videos"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {projects.length ? (
                  <div className="project-grid">
                    {projects
                      .filter((p) =>
                        p.filename.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((p) => (
                        <button
                          className="project-card"
                          key={p.id}
                          onClick={() => navigate(`/projects/${p.id}`)}
                        >
                          <div className="project-cover">
                            {p.status === "ready" ? (
                              <img
                                src={api.mediaUrl(p.id, "thumbnail")}
                                alt=""
                              />
                            ) : (
                              <Film size={30} />
                            )}
                            <span className={`status ${p.status}`}>
                              {p.status}
                            </span>
                          </div>
                          <div>
                            <h3>{p.filename}</h3>
                            <span>
                              {formatTime(p.duration_seconds || 0)}{" "}
                              <ArrowRight size={16} />
                            </span>
                          </div>
                        </button>
                      ))}
                  </div>
                ) : (
                  <div className="empty-library">
                    <Film size={26} />
                    <h3>A fresh start.</h3>
                    <p>Your imported videos will be saved here.</p>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
        <footer className="footer">
          Made for the moments that matter.{" "}
          <span>Preview every suggestion before sharing.</span>
        </footer>
      </main>
    </div>
  );
}

function SourceWorkspace({
  project,
  options,
  setOptions,
  refresh,
  onError,
  onNotice,
}: {
  project: api.Project;
  options: api.Options;
  setOptions: (o: api.Options) => void;
  refresh: () => Promise<void>;
  onError: (e: unknown) => void;
  onNotice: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [transcriptLanguage, setTranscriptLanguage] = useState("en");
  const video = useRef<HTMLVideoElement>(null);
  async function generate() {
    setBusy(true);
    try {
      await api.generate(project.id, options);
      navigate(`/projects/${project.id}/shorts`);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="back-link" onClick={() => navigate("/")}>
        <ArrowLeft size={16} /> My videos
      </button>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">YOUR ORIGINAL STORY</span>
          <h1>{project.filename}</h1>
          <p>
            {project.status === "ready"
              ? `${formatTime(project.duration_seconds || 0)} · Ready to find your next short`
              : "Your video is in the queue."}
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => navigate(`/projects/${project.id}/shorts`)}
        >
          View shorts <ArrowRight size={16} />
        </button>
      </div>
      <div className="source-grid">
        <section className="source-player card">
          {project.status === "ready" ? (
            <>
              <video
                ref={video}
                controls
                preload="metadata"
                src={api.mediaUrl(project.id, "preview")}
                poster={api.mediaUrl(project.id, "thumbnail")}
              />
              <div className="source-timeline">
                <span>0:00</span>
                <input
                  type="range"
                  aria-label="Seek original video"
                  min={0}
                  max={project.duration_seconds || 0}
                  step={0.1}
                  defaultValue={0}
                  onChange={(e) => {
                    if (video.current)
                      video.current.currentTime = Number(e.target.value);
                  }}
                />
                <span>{formatTime(project.duration_seconds || 0)}</span>
              </div>
              <div className="player-footer">
                <span>
                  <Film size={16} /> Original video
                </span>
                {project.has_audio && (
                  <a href={api.mediaUrl(project.id, "audio")}>
                    <Download size={15} /> Extract MP3
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="preparing">
              <LoaderCircle
                className={project.status === "failed" ? "" : "spin"}
              />
              <h2>
                {project.status === "failed"
                  ? "This video needs attention."
                  : "Getting your story ready…"}
              </h2>
              <p>
                {project.error ||
                  "Preparing the preview and extracting audio. You can leave this page and come back."}
              </p>
              {project.status === "failed" && (
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      await api.retryProject(project.id);
                      await refresh();
                    } catch (e) {
                      onError(e);
                    }
                  }}
                >
                  Retry import
                </button>
              )}
            </div>
          )}
        </section>
        <section className="card generate-panel">
          <span className="step-label">02 / FIND THE GOOD PARTS</span>
          <h2>Ready for a shorter story?</h2>
          <Preferences value={options} onChange={setOptions} />
          <button
            className="primary wide"
            disabled={project.status !== "ready" || busy}
            onClick={() => void generate()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Sparkles size={18} />
            )}{" "}
            Generate shorts
          </button>
          <p className="hint">
            Processing time depends on video length and hardware. First use
            downloads the speech model.
          </p>
          <details className="transcript-upload">
            <summary>Already have a transcript?</summary>
            <p className="hint">
              Upload timed SRT captions to skip transcription. Choose the
              transcript’s actual language.
            </p>
            <label>
              Transcript language
              <select
                value={transcriptLanguage}
                onChange={(e) => setTranscriptLanguage(e.target.value)}
              >
                {languages.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="secondary file-button">
              Upload SRT
              <input
                type="file"
                accept=".srt"
                className="sr-only"
                aria-label="Upload SRT transcript"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 200000) {
                    onError(
                      new Error("Choose an SRT transcript under 200 KB."),
                    );
                    return;
                  }
                  try {
                    await api.uploadTranscript(
                      project.id,
                      await file.text(),
                      transcriptLanguage,
                    );
                    setOptions({ ...options, language: transcriptLanguage });
                    onNotice(
                      "Transcript saved. We’ll use your timed captions for the next generation.",
                    );
                    await refresh();
                  } catch (err) {
                    onError(err);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </details>
        </section>
      </div>
    </>
  );
}

function Results({
  project,
  onError,
}: {
  project: api.Project;
  onError: (e: unknown) => void;
}) {
  const [shorts, setShorts] = useState<api.Short[]>([]);
  const [jobs, setJobs] = useState<api.Job[]>([]);
  const [selected, setSelected] = useState("");
  const load = useCallback(async () => {
    try {
      const [s, j] = await Promise.all([
        api.shorts(project.id),
        api.jobs(project.id),
      ]);
      setShorts(s);
      setJobs(j);
      setSelected((old) => old || s[0]?.id || "");
    } catch (e) {
      onError(e);
    }
  }, [project.id, onError]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [load]);
  const current = shorts.find((s) => s.id === selected);
  const generating = jobs.find(
    (j) => j.kind === "generate" && ["queued", "processing"].includes(j.status),
  );
  const latestGeneration = jobs.find((j) => j.kind === "generate");
  const failed =
    latestGeneration?.status === "failed" ? latestGeneration : undefined;
  return (
    <>
      <button
        className="back-link"
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        <ArrowLeft size={16} /> Original video & preferences
      </button>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">LESS SEARCHING. MORE SHARING.</span>
          <h1>Your story, in shorts.</h1>
          <p>
            {shorts.length
              ? `${shorts.length} suggested moments from ${project.filename}`
              : "Let’s find the moments worth sharing."}
          </p>
        </div>
        <span className="pill">
          <Sparkles size={15} /> You have the final cut
        </span>
      </div>
      {generating && (
        <div className="job-banner" role="status">
          <LoaderCircle className="spin" />
          <div>
            <strong>{generating.stage}</strong>
            <p>
              We’re preserving the original context and checking visual quality.
            </p>
          </div>
        </div>
      )}
      {failed && !generating && (
        <div role="alert" className="alert">
          <div>
            <strong>Generation needs attention.</strong>
            <p>{failed.error}</p>
          </div>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await api.retryJob(failed.id);
                await load();
              } catch (e) {
                onError(e);
              }
            }}
          >
            Retry generation
          </button>
        </div>
      )}
      {shorts.length > 0 && (
        <div className="short-selector" aria-label="Suggested shorts">
          {shorts.map((s, i) => (
            <button
              key={s.id}
              className={s.id === selected ? "active" : ""}
              onClick={() => setSelected(s.id)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                {s.title}
                <small>
                  {formatTime(s.start_ms / 1000)}–{formatTime(s.end_ms / 1000)}
                </small>
              </div>
            </button>
          ))}
        </div>
      )}
      {current ? (
        <ClipWorkspace
          key={current.id}
          short={current}
          jobs={jobs}
          onSaved={(saved) =>
            setShorts((old) => old.map((s) => (s.id === saved.id ? saved : s)))
          }
          refresh={load}
          onError={onError}
        />
      ) : (
        !generating &&
        !failed && (
          <section className="empty-state">
            <Scissors size={32} />
            <h2>A short story starts with your video.</h2>
            <p>
              Choose your preferences, then generate your first suggestions.
            </p>
            <button
              className="primary"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              Choose preferences <ArrowRight size={17} />
            </button>
          </section>
        )
      )}
    </>
  );
}
