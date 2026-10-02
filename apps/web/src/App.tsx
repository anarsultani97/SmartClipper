import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  Link2,
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
  Gamepad2,
} from "lucide-react";
import * as api from "./api";
import { formatTime, validateVideo } from "./media";
import { AuthView } from "./AuthView";
import { ClipWorkspace, ThumbnailEditor } from "./ClipWorkspace";
import { ActivityDashboard } from "./ActivityDashboard";
import { AuthGate, useAuthGate } from "./AuthGate";
import { ProgressRing } from "./ProgressRing";
import { LinkImport } from "./LinkImport";
const ReactionGame = lazy(() => import("./ReactionGame"));
import {
  EditedVideoPlayer,
  VideoEditor,
  normalizeEdits,
  validTrim,
} from "./VideoEditor";

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
  transcription_mode: "balanced",
  thumbnail_focus: "auto",
  vocabulary: "",
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
      <details className="advanced-preferences">
        <summary>Speech accuracy & cover framing</summary>
        <label>
          Speech processing
          <select
            value={value.transcription_mode || "balanced"}
            onChange={(e) => change("transcription_mode", e.target.value)}
          >
            <option value="fast">Fast · clearer audio</option>
            <option value="balanced">Balanced · multilingual speech</option>
            <option value="accurate">Higher accuracy · takes longer</option>
          </select>
        </label>
        <label>
          Names, slang or game terms
          <input
            maxLength={160}
            placeholder="Optional: names or terms heard in the video"
            value={value.vocabulary || ""}
            onChange={(e) => change("vocabulary", e.target.value)}
          />
        </label>
        <label>
          Thumbnail focus
          <select
            value={value.thumbnail_focus || "auto"}
            onChange={(e) => change("thumbnail_focus", e.target.value)}
          >
            <option value="auto">Auto · people & scene</option>
            <option value="people">People & guests</option>
            <option value="gameplay">Gameplay + creator</option>
            <option value="scene">Keep the whole scene</option>
          </select>
        </label>
        <p className="hint">
          Explicit language and names can help recognition. Beeps and muted
          words need your review; missing audio cannot be recovered.
        </p>
      </details>
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
  const [guestPending, setGuestPending] = useState(false);
  const [showAuth, setShowAuth] = useState(
    new URLSearchParams(window.location.search).has("signin"),
  );
  const [projects, setProjects] = useState<api.Project[]>([]);
  const [path, setPath] = useState(
    window.location.pathname + window.location.search,
  );
  const [error, setError] = useState("");
  const [options, setOptions] = useState(defaultOptions);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadingName, setUploadingName] = useState("");
  const [linkImportOpen, setLinkImportOpen] = useState(false);
  const [localPreview, setLocalPreview] = useState("");
  const [localPreviewId, setLocalPreviewId] = useState("");
  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );
  useEffect(() => {
    setLocalPreview("");
    setLocalPreviewId("");
    setLinkImportOpen(false);
  }, [user?.id]);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [highlightedProject, setHighlightedProject] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const removedIds = useRef(new Set<string>());
  const accountEpoch = useRef(0);
  const refreshSequence = useRef(0);
  const highlightRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const authBootstrap = useRef<Promise<api.User> | null>(null);
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
    let active = true;
    authBootstrap.current ??= api
      .currentUser()
      .catch(() => api.guestWorkspace());
    authBootstrap.current
      .then((u) => {
        if (!active) return;
        api.setCsrf(u.csrf);
        setUser(u);
      })
      .catch((e) => {
        if (!active) return;
        setError(message(e));
        setUser({
          id: "",
          name: "Guest workspace",
          email: "",
          csrf: "",
          is_guest: true,
        });
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
      abort.current?.abort();
    };
  }, []);
  const reportError = useCallback((e: unknown) => setError(message(e)), []);
  const refresh = useCallback(async () => {
    const epoch = accountEpoch.current;
    const sequence = ++refreshSequence.current;
    const current = () =>
      epoch === accountEpoch.current && sequence === refreshSequence.current;
    try {
      const data = await api.listProjects();
      if (current())
        setProjects(data.filter((p) => !removedIds.current.has(p.id)));
    } catch (e) {
      if (current()) setError(message(e));
    } finally {
      if (current()) setLibraryLoaded(true);
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
    if (!user?.id) return;
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [user, refresh]);
  async function upload(file?: File) {
    if (!file || progress !== null) return;
    if (!user?.id) {
      setError("Your workspace is reconnecting. Please try again shortly.");
      return;
    }
    const invalid = validateVideo(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError("");
    setProgress(0);
    setLocalPreview(URL.createObjectURL(file));
    setLocalPreviewId("");
    navigate("/");
    setUploadingName(file.name);
    abort.current = new AbortController();
    const epoch = accountEpoch.current;
    try {
      const p = await api.uploadVideo(
        file,
        (value) => {
          if (epoch === accountEpoch.current) setProgress(value);
        },
        abort.current.signal,
      );
      if (epoch !== accountEpoch.current) return;
      setLocalPreviewId(p.id);
      ++refreshSequence.current;
      setProjects((old) => [p, ...old.filter((v) => v.id !== p.id)]);
      navigate(`/projects/${p.id}`);
      setHighlightedProject(p.id);
      setNotice(
        "Video uploaded! Follow its preparation in Recent videos on the left (above on mobile).",
      );
    } catch (e) {
      if (epoch === accountEpoch.current) {
        setError(message(e));
        setLocalPreview("");
      }
    } finally {
      if (epoch === accountEpoch.current) {
        setProgress(null);
        if (input.current) input.current.value = "";
      }
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
    const epoch = accountEpoch.current;
    try {
      await api.removeQueuedVideo(p.id);
      if (epoch !== accountEpoch.current) return;
      removedIds.current.add(p.id);
      setProjects((old) => old.filter((video) => video.id !== p.id));
      if (selectedId === p.id) navigate("/");
      setNotice(`${p.filename} was removed from the queue.`);
    } catch (e) {
      if (epoch === accountEpoch.current) {
        reportError(e);
        await refresh();
      }
    } finally {
      if (epoch === accountEpoch.current) setDeletingId("");
    }
  }
  const results = !!selected && path.includes("/shorts");
  const thumbId = new URLSearchParams(path.split("?")[1] || "").get(
    "thumbnail",
  );
  function closeAuth() {
    const url = new URL(window.location.href);
    url.searchParams.delete("signin");
    url.searchParams.delete("auth_error");
    const next = url.pathname + url.search;
    window.history.replaceState(null, "", next);
    setPath(next);
    setShowAuth(false);
  }
  if (!authReady)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (showAuth)
    return (
      <AuthView
        onBack={closeAuth}
        onLogin={(u) => {
          ++accountEpoch.current;
          abort.current?.abort();
          setProgress(null);
          api.setCsrf(u.csrf);
          setUser(u);
          closeAuth();
        }}
      />
    );
  return (
    <AuthGate.Provider
      value={{
        isGuest: !user || !!user.is_guest,
        requestSignIn: () => setShowAuth(true),
      }}
    >
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
            Clivvy<span className="beta">BETA</span>
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
            <span className="avatar">
              {user?.name[0]?.toUpperCase() || "G"}
            </span>
            <span>
              {user?.name || "Guest workspace"}
              <small>
                {user?.is_guest
                  ? "Sign in when you're ready to download"
                  : "Your private workspace"}
              </small>
            </span>
            <button
              aria-label={user?.is_guest ? "Sign in" : "Sign out"}
              disabled={guestPending}
              className="icon-button"
              onClick={async () => {
                if (user?.is_guest) {
                  setShowAuth(true);
                  return;
                }
                try {
                  await api.logout();
                  ++accountEpoch.current;
                  abort.current?.abort();
                  setProgress(null);
                  setDeletingId("");
                  setHighlightedProject("");
                  api.setCsrf("");
                  setUser({
                    id: "",
                    name: "Guest workspace",
                    email: "",
                    csrf: "",
                    is_guest: true,
                  });
                  setProjects([]);
                  removedIds.current.clear();
                  setLibraryLoaded(false);
                  navigate("/");
                  setGuestPending(true);
                  const guest = await api.guestWorkspace();
                  api.setCsrf(guest.csrf);
                  setUser(guest);
                } catch (e) {
                  setError(message(e));
                } finally {
                  setGuestPending(false);
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
            <button
              className="secondary paste-link-button"
              disabled={!user?.id}
              onClick={() => setLinkImportOpen(true)}
            >
              <Link2 size={16} /> Paste video link
            </button>
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
            {linkImportOpen && (
              <LinkImport
                onClose={() => setLinkImportOpen(false)}
                onImported={(project) => {
                  ++refreshSequence.current;
                  setLocalPreview("");
                  setLocalPreviewId("");
                  setProjects((old) => [
                    project,
                    ...old.filter((p) => p.id !== project.id),
                  ]);
                  setHighlightedProject(project.id);
                  navigate(`/projects/${project.id}`);
                  setNotice(
                    "Your link is queued. Follow download and preparation in Recent videos.",
                  );
                }}
              />
            )}
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
                    key={`${selected.id}:${thumbId}`}
                    project={selected}
                    shortId={thumbId}
                    onError={reportError}
                  />
                ) : (
                  <Results
                    key={selected.id}
                    project={selected}
                    onError={reportError}
                  />
                )
              ) : (
                <SourceWorkspace
                  key={selected.id}
                  project={selected}
                  options={options}
                  setOptions={setOptions}
                  refresh={refresh}
                  onError={reportError}
                  onNotice={setNotice}
                  localPreview={
                    localPreviewId === selected.id ? localPreview : ""
                  }
                />
              )
            ) : selectedId ? (
              <section className="empty-state">
                <h2>Video unavailable.</h2>
                <p>
                  If you just opened this page, your library may still be
                  loading.
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
                    {progress !== null ? (
                      progress === 100 && localPreview ? (
                        <>
                          <video
                            className="local-upload-preview"
                            controls
                            src={localPreview}
                          />
                          <p role="status">
                            Upload complete. Preparing your video for shorts…
                          </p>
                        </>
                      ) : (
                        <ProgressRing
                          value={progress}
                          label="Uploading your video"
                          detail="Your preview will appear when upload reaches 100%."
                        />
                      )
                    ) : (
                      <>
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
                        <button
                          className="text-button paste-link-inline"
                          disabled={!user?.id}
                          onClick={() => setLinkImportOpen(true)}
                        >
                          <Link2 size={16} /> Or paste a video link
                        </button>
                        <div className="upload-foot">
                          <Check size={14} /> Original audio stays with your
                          story
                        </div>
                      </>
                    )}
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
                    <p>
                      Quality-checked cover choices, plus your own thumbnail.
                    </p>
                  </div>
                  <div>
                    <WandSparkles />
                    <h3>Your final say</h3>
                    <p>
                      Preview the context, customize, and download your
                      favorites.
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
                          p.filename
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((p) => (
                          <div className="project-card" key={p.id}>
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
                              <div className="library-actions">
                                <button
                                  className="text-button"
                                  onClick={() => navigate(`/projects/${p.id}`)}
                                >
                                  Open video
                                </button>
                                {!!p.shorts_count && (
                                  <button
                                    className="primary shorts-return"
                                    onClick={() =>
                                      navigate(`/projects/${p.id}/shorts`)
                                    }
                                  >
                                    <Scissors size={14} /> View shorts
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
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
    </AuthGate.Provider>
  );
}

function SourceWorkspace({
  project,
  options,
  setOptions,
  refresh,
  onError,
  onNotice,
  localPreview,
}: {
  project: api.Project;
  options: api.Options;
  setOptions: (o: api.Options) => void;
  refresh: () => Promise<void>;
  onError: (e: unknown) => void;
  onNotice: (m: string) => void;
  localPreview: string;
}) {
  const { isGuest, requestSignIn } = useAuthGate();
  const [busy, setBusy] = useState(false);
  const [transcriptLanguage, setTranscriptLanguage] = useState("en");
  const sourceValue = (p: api.Project): api.VideoEdits => ({
    ...normalizeEdits(p.video_edits),
    trim_start_ms: p.start_ms,
    trim_end_ms: p.end_ms || Math.floor((p.duration_seconds || 0) * 1000),
  });
  const [draftProject, setDraftProject] = useState(project);
  const [edits, setEdits] = useState(sourceValue(project));
  const [editBusy, setEditBusy] = useState(false);
  const previousProject = useRef(project);
  const durationMs = Math.floor((project.duration_seconds || 0) * 1000);
  const dirty =
    JSON.stringify(edits) !== JSON.stringify(sourceValue(draftProject));
  useEffect(() => {
    const previous = previousProject.current;
    if (JSON.stringify(edits) === JSON.stringify(sourceValue(previous))) {
      setEdits(sourceValue(project));
      setDraftProject(project);
    }
    previousProject.current = project;
  }, [project]);
  async function applyEdits() {
    if (!validTrim(edits, durationMs)) return null;
    setEditBusy(true);
    try {
      const saved = await api.saveProjectEdits(draftProject, edits);
      setDraftProject(saved);
      setEdits(sourceValue(saved));
      onNotice(
        "Edits applied. Your next shorts will use this selection and these adjustments.",
      );
      await refresh();
      return saved;
    } catch (e) {
      onError(e);
      return null;
    } finally {
      setEditBusy(false);
    }
  }
  async function generate() {
    setBusy(true);
    try {
      if (dirty && !(await applyEdits())) return;
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
          className="primary shorts-return"
          onClick={() => navigate(`/projects/${project.id}/shorts`)}
        >
          View shorts <ArrowRight size={16} />
        </button>
      </div>
      <div className="source-grid">
        <section className="source-player card">
          {project.status !== "failed" &&
          (project.status === "ready" || localPreview) ? (
            <>
              {project.status === "ready" ? (
                <EditedVideoPlayer
                  src={api.mediaUrl(project.id, "preview")}
                  edits={{ ...edits, framing: "horizontal", fit: "fit" }}
                  start={edits.trim_start_ms / 1000}
                  end={(edits.trim_end_ms ?? durationMs) / 1000}
                  label="Original video preview"
                />
              ) : (
                <video controls preload="metadata" src={localPreview} />
              )}
              <div className="player-footer">
                <span>
                  <Film size={16} />{" "}
                  {project.status === "ready"
                    ? "Original video"
                    : `${project.stage} · ${project.progress}%`}
                </span>
                {project.has_audio && (
                  <a
                    href={api.mediaUrl(project.id, "audio")}
                    onClick={(event) => {
                      if (isGuest) {
                        event.preventDefault();
                        requestSignIn();
                      }
                    }}
                  >
                    <Download size={15} /> Extract MP3
                  </a>
                )}
              </div>
              {project.status === "ready" && (
                <details className="source-edit-panel">
                  <summary>Edit original video · trim, picture & sound</summary>
                  <VideoEditor
                    source
                    value={edits}
                    durationMs={durationMs}
                    onChange={setEdits}
                  />
                  <div className="action-row">
                    <button
                      className="primary"
                      disabled={
                        editBusy ||
                        busy ||
                        !dirty ||
                        !validTrim(edits, durationMs)
                      }
                      onClick={() => void applyEdits()}
                    >
                      {editBusy ? "Applying…" : "Apply changes"}
                    </button>
                    {dirty && (
                      <button
                        className="text-button"
                        disabled={editBusy}
                        onClick={() => setEdits(sourceValue(draftProject))}
                      >
                        Discard changes
                      </button>
                    )}
                  </div>
                  <p className="hint">
                    {dirty
                      ? "You have unapplied changes. Generating shorts will apply them first."
                      : "Your original upload stays intact. Applied edits are used for your next suggestions."}
                  </p>
                </details>
              )}
            </>
          ) : (
            <div className="preparing">
              {project.status !== "failed" && (
                <ProgressRing
                  value={project.progress || 0}
                  label={project.stage || "Getting your story ready"}
                  detail="Preparing video and audio. You can leave this page and come back."
                />
              )}
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
            disabled={
              project.status !== "ready" ||
              busy ||
              editBusy ||
              !validTrim(edits, durationMs)
            }
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
  const [previewId, setPreviewId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [arrival, setArrival] = useState("");
  const publishedIds = useRef(new Set<string>());
  const currentGeneration = useRef("");
  const pollDelay = useRef(1000);
  const loadSequence = useRef(0);
  const active = useRef(false);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const j = await api.jobs(project.id);
      const generation = j.find((item) => item.kind === "generate");
      const s = await api.shorts(project.id, generation?.id);
      if (!active.current || sequence !== loadSequence.current) return;
      const processing = j.some((item) =>
        ["queued", "processing"].includes(item.status),
      );
      const generationProcessing =
        generation && ["queued", "processing"].includes(generation.status);
      pollDelay.current = processing ? 1000 : 10000;
      if (currentGeneration.current !== (generation?.id || "")) {
        currentGeneration.current = generation?.id || "";
        publishedIds.current = new Set();
        setArrival("");
      }
      const newItems = s.filter((item) => !publishedIds.current.has(item.id));
      if (
        newItems.length &&
        (generationProcessing ||
          (generation?.status === "ready" && publishedIds.current.size > 0))
      ) {
        setArrival(
          publishedIds.current.size === 0
            ? "Your first short is ready. Take a look while we finish the rest."
            : `${s.length} shorts ready. Another moment just landed.`,
        );
      }
      publishedIds.current = new Set(s.map((item) => item.id));
      setShorts([...s].sort((a, b) => a.start_ms - b.start_ms));
      setJobs(j);
      setLoaded(true);
      setPreviewId((old) =>
        s.some((item) => item.id === old) ? old : s[0]?.id || "",
      );
    } catch (e) {
      pollDelay.current = 10000;
      if (active.current && sequence === loadSequence.current) onError(e);
    }
  }, [project.id, onError]);
  useEffect(() => {
    active.current = true;
    let stopped = false;
    let polling = false;
    let timer = 0;
    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        await load();
      } finally {
        polling = false;
      }
      if (!stopped)
        timer = window.setTimeout(
          poll,
          document.hidden ? 30000 : pollDelay.current,
        );
    };
    void poll();
    const resume = () => {
      if (!document.hidden) {
        window.clearTimeout(timer);
        if (!stopped) void poll();
      }
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      active.current = false;
      ++loadSequence.current;
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [load]);

  const generating = jobs.find(
    (j) => j.kind === "generate" && ["queued", "processing"].includes(j.status),
  );
  const latestGeneration = jobs.find((j) => j.kind === "generate");
  const failed =
    latestGeneration?.status === "failed" ? latestGeneration : undefined;
  const planned = generating?.planned_count ?? null;
  const remaining = planned === null ? 1 : Math.max(0, planned - shorts.length);
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
              ? `${shorts.length} suggested ${shorts.length === 1 ? "moment" : "moments"} from ${project.filename}`
              : "Let’s find the moments worth sharing."}
          </p>
        </div>
        <span className="pill">
          <Sparkles size={15} /> You have the final cut
        </span>
      </div>
      {generating && (
        <div className="job-banner progressive-banner">
          <ProgressRing
            value={generating.progress || 0}
            label={generating.stage}
            compact
          />
          <div>
            <span className="eyebrow">YOUR MOMENTS ARE TAKING SHAPE</span>
            <strong>
              {shorts.length
                ? `${shorts.length}${planned === null ? "" : ` of ${planned}`} ${(planned ?? shorts.length) === 1 ? "short" : "shorts"} ready`
                : "Finding your first great moment"}
            </strong>
            <p>
              {shorts.length
                ? "Preview and edit the ready shorts now. The rest keep processing."
                : "Each short appears as soon as its preview and cover checks finish."}
            </p>
            <span className="generation-current-step">{generating.stage}</span>
          </div>
          <button
            className="secondary game-trigger"
            onClick={() => setGameOpen((old) => !old)}
            aria-expanded={gameOpen}
          >
            <Gamepad2 size={17} />
            {gameOpen ? "Hide game" : "Quick reaction break"}
          </button>
        </div>
      )}
      {arrival && generating && (
        <p className="short-arrival notice" role="status" key={arrival}>
          <Check size={18} />
          {arrival}
        </p>
      )}
      {gameOpen && (
        <Suspense fallback={<p className="hint">Opening your tiny break…</p>}>
          <ReactionGame
            onClose={() => setGameOpen(false)}
            processing={!!generating}
          />
        </Suspense>
      )}
      {!generating &&
        latestGeneration?.status === "ready" &&
        shorts.length > 0 && (
          <div className="batch-complete" role="status">
            <Check size={18} />
            <strong>All {shorts.length} shorts are ready.</strong>
            <span>Your next step: review, make it yours, then export.</span>
          </div>
        )}
      {generating && !shorts.length && (
        <section className="generation-stage card">
          <ProgressRing
            value={generating.progress || 0}
            label={generating.stage}
            detail="Your first short appears here as soon as it is ready. Percentages show processing progress; duration depends on the video and hardware."
          />
        </section>
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
      {shorts.length > 0 ? (
        <section
          className="shorts-feed"
          aria-label="All suggested shorts in timeline order"
        >
          <p className="shorts-feed-note">
            {shorts.length} {shorts.length === 1 ? "short" : "shorts"} to
            explore · earliest moment first. Preview any card or choose Edit
            short.
          </p>
          {shorts.map((short, index) => (
            <ClipWorkspace
              key={short.id}
              short={short}
              index={index}
              initialEditing={false}
              previewActive={previewId === short.id}
              onActivate={() => setPreviewId(short.id)}
              jobs={jobs}
              refresh={load}
              onError={onError}
              onSaved={(saved) => {
                if (!active.current) return;
                ++loadSequence.current;
                setShorts((old) =>
                  old.map((s) => (s.id === saved.id ? saved : s)),
                );
              }}
            />
          ))}
          {generating && remaining > 0 && (
            <div
              className="pending-shorts"
              aria-label="More shorts are processing"
            >
              {Array.from({ length: Math.min(remaining, 3) }, (_, index) => (
                <div className="pending-short" key={index}>
                  <span className="pending-art" aria-hidden="true">
                    <Sparkles size={22} />
                  </span>
                  <div>
                    <strong>
                      {planned === null
                        ? "More moments on the way"
                        : `Short ${shorts.length + index + 1} is taking shape`}
                    </strong>
                    <p>
                      Checking context, sound and clear covers before it
                      appears.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        loaded &&
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
