import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { App, Preferences, defaultOptions, navigate } from "./App";
import { ClipWorkspace, ThumbnailEditor } from "./ClipWorkspace";
import { AuthGate } from "./AuthGate";
import * as api from "./api";
vi.mock("./api");
const user = {
  id: "u",
  name: "Creator",
  email: "creator@example.com",
  csrf: "test",
};
const project: api.Project = {
  id: "ready",
  filename: "podcast.mp4",
  size_bytes: 20,
  status: "ready",
  error: null,
  duration_seconds: 180,
  width: 1920,
  height: 1080,
  has_audio: true,
  start_ms: 0,
  end_ms: 60000,
  revision: 1,
  detected_language: null,
  transcript_language: null,
};
const short: api.Short = {
  id: "s1",
  project_id: "ready",
  job_id: "j",
  title: "A thoughtful idea",
  summary: ["First sentence.", "Second sentence.", "Third sentence."],
  start_ms: 10000,
  end_ms: 40000,
  thumbnails: [
    { index: 0, time_seconds: 12 },
    { index: 1, time_seconds: 22 },
    { index: 2, time_seconds: 32 },
  ],
  thumbnail: 0,
  thumbnail_style: "bold",
  thumbnail_text: "A thoughtful idea",
  subtitles: true,
  subtitle_language: "original",
  music: "none",
  revision: 1,
  export_revision: null,
  english_available: true,
  transcript: [],
  quality_note: "Review before sharing.",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.history.replaceState(null, "", "/");
  vi.mocked(api.health).mockResolvedValue({
    status: "ok",
    mode: "owned-workspaces",
    max_upload_bytes: 3 * 1024 ** 3,
    max_duration_seconds: 3600,
  });
  vi.mocked(api.currentUser).mockResolvedValue(user);
  vi.mocked(api.guestWorkspace).mockResolvedValue({
    ...user,
    id: "guest",
    is_guest: true,
  });
  vi.mocked(api.listProjects).mockResolvedValue([]);
  vi.mocked(api.providers).mockResolvedValue({
    google: false,
    facebook: false,
  });
  vi.mocked(api.jobs).mockResolvedValue([]);
  vi.mocked(api.shorts).mockResolvedValue([]);
  vi.mocked(api.musicLibrary).mockResolvedValue([]);
  vi.mocked(api.audioAssets).mockResolvedValue([]);
  vi.mocked(api.mediaUrl).mockImplementation(
    (id, kind) => `/media/${id}/${kind}`,
  );
  vi.mocked(api.shortMedia).mockImplementation(
    (id, kind) => `/short/${id}/${kind}`,
  );
});
it("does not restore a previous account's projects from a delayed poll", async () => {
  let finish!: (value: api.Project[]) => void;
  vi.mocked(api.listProjects).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  vi.mocked(api.logout).mockResolvedValue({});
  vi.mocked(api.authenticate).mockResolvedValue({ ...user, id: "second" });
  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Sign out" }),
  );
  await act(async () => {
    finish([{ ...project, filename: "private-first-account.mp4" }]);
  });
  await userEvent.click(await screen.findByRole("button", { name: "Sign in" }));
  await userEvent.type(
    screen.getByLabelText("Email address"),
    "second@example.com",
  );
  await userEvent.type(screen.getByLabelText("Password"), "test-password-123");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("button", { name: "Choose video" });
  expect(
    screen.queryByText("private-first-account.mp4"),
  ).not.toBeInTheDocument();
});
it("clears the old account library even when guest setup fails after logout", async () => {
  vi.mocked(api.listProjects).mockResolvedValue([project]);
  vi.mocked(api.logout).mockResolvedValue({});
  vi.mocked(api.guestWorkspace).mockRejectedValue(
    new Error("Service temporarily unavailable"),
  );
  render(<App />);
  await screen.findByRole("button", { name: "Sign out" });
  await waitFor(() =>
    expect(screen.getAllByText("podcast.mp4").length).toBeGreaterThan(0),
  );
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByText("Service temporarily unavailable");
  expect(screen.queryByText("podcast.mp4")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Sign out" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Choose video" }),
  ).toBeInTheDocument();
});
it("keeps a newly uploaded video when an older empty poll finishes", async () => {
  let finish!: (value: api.Project[]) => void;
  vi.mocked(api.listProjects).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  vi.mocked(api.uploadVideo).mockResolvedValue({
    ...project,
    status: "queued",
  });
  render(<App />);
  await screen.findByRole("button", { name: "Choose video" });
  await userEvent.upload(
    screen.getByLabelText("Import video file"),
    new File(["video"], "podcast.mp4", { type: "video/mp4" }),
  );
  await screen.findByText("Your video is in the queue.");
  await act(async () => {
    finish([]);
  });
  expect(screen.getByText("Your video is in the queue.")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Remove podcast.mp4 from queue" }),
  ).toBeInTheDocument();
});
it("resets results selection when switching projects", async () => {
  window.history.replaceState(null, "", "/projects/ready/shorts");
  const second = { ...project, id: "second", filename: "second.mp4" };
  vi.mocked(api.listProjects).mockResolvedValue([project, second]);
  vi.mocked(api.shorts).mockImplementation(async (id) =>
    id === "ready"
      ? [short]
      : [
          {
            ...short,
            id: "s2",
            project_id: "second",
            title: "Second video story",
          },
        ],
  );
  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Edit short/ }),
  );
  await screen.findByLabelText("Short title");
  await act(async () => {
    navigate("/projects/second/shorts");
  });
  await userEvent.click(
    await screen.findByRole("button", { name: /Edit short/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Short title")).toHaveValue(
      "Second video story",
    ),
  );
  expect(
    screen.queryByText("A short story starts with your video."),
  ).not.toBeInTheDocument();
});
it("ignores results that finish after leaving their project", async () => {
  window.history.replaceState(null, "", "/projects/ready/shorts");
  let finish!: (value: api.Short[]) => void;
  const pending = new Promise<api.Short[]>((resolve) => {
    finish = resolve;
  });
  vi.mocked(api.listProjects).mockResolvedValue([
    project,
    { ...project, id: "second" },
  ]);
  vi.mocked(api.shorts).mockImplementation((id) =>
    id === "ready"
      ? pending
      : Promise.resolve([
          {
            ...short,
            id: "s2",
            project_id: "second",
            title: "Second video story",
          },
        ]),
  );
  render(<App />);
  await waitFor(() =>
    expect(api.shorts).toHaveBeenCalledWith("ready", undefined),
  );
  await act(async () => {
    navigate("/projects/second/shorts");
  });
  await userEvent.click(
    await screen.findByRole("button", { name: /Edit short/ }),
  );
  await screen.findByLabelText("Short title");
  await act(async () => {
    finish([short]);
  });
  expect(screen.getByLabelText("Short title")).toHaveValue(
    "Second video story",
  );
});
it("shows only the guided direction even with historical review URLs", async () => {
  window.history.replaceState(null, "", "/?review&design=studio");
  render(<App />);
  expect(
    await screen.findByRole("button", { name: "Choose video" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Three ways to find your next short."),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Video language")).toBeInTheDocument();
});
it("shows twelve languages including Turkish and Azerbaijani, auto-detection and English subtitles", async () => {
  const change = vi.fn();
  render(<Preferences value={defaultOptions} onChange={change} />);
  expect(
    screen.getByLabelText("Video language").querySelectorAll("option"),
  ).toHaveLength(13);
  await userEvent.selectOptions(screen.getByLabelText("Video language"), "az");
  expect(change).toHaveBeenCalledWith({ ...defaultOptions, language: "az" });
  await userEvent.selectOptions(screen.getByLabelText("Video language"), "es");
  expect(change).toHaveBeenCalledWith({ ...defaultOptions, language: "es" });
  await userEvent.click(screen.getByRole("switch"));
  expect(change).toHaveBeenCalledWith({
    ...defaultOptions,
    english_subtitles: true,
  });
});
it("rejects invalid video uploads before the API", async () => {
  render(<App />);
  await screen.findByRole("button", { name: "Choose video" });
  await userEvent
    .setup({ applyAccept: false })
    .upload(
      screen.getByLabelText("Import video file"),
      new File(["test"], "audio.mp3"),
    );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Choose an MP4 video.",
  );
  expect(api.uploadVideo).not.toHaveBeenCalled();
});
it("shows upload progress, then keeps the preparation game with the local preview", async () => {
  let finish: ((project: api.Project) => void) | undefined;
  vi.mocked(api.uploadVideo).mockImplementation((_file, progress) => {
    progress(37);
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  render(<App />);
  await screen.findByRole("button", { name: "Choose video" });
  await userEvent.upload(
    screen.getByLabelText("Import video file"),
    new File(["video"], "podcast.mp4", { type: "video/mp4" }),
  );
  expect(
    screen.getByRole("progressbar", { name: "Video upload progress" }),
  ).toHaveAttribute("value", "37");
  expect(screen.getByText("37%", { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Play game" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Cancel upload" }),
  ).toBeInTheDocument();
  await act(async () => {
    finish?.({
      ...project,
      status: "queued",
      stage: "Getting your video ready",
      progress: 5,
    });
  });
  expect(
    screen.queryByRole("progressbar", { name: "Video upload progress" }),
  ).not.toBeInTheDocument();
  expect(document.querySelector("video")?.getAttribute("src")).toMatch(
    /^blob:/,
  );
  const preparation = screen.getByRole("progressbar", {
    name: "Getting your video ready",
  });
  expect(preparation).toHaveAttribute("aria-valuenow", "5");
  const gameButton = screen.getByRole("button", { name: "Play game" });
  expect(
    gameButton.compareDocumentPosition(preparation) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  await userEvent.click(gameButton);
  expect(
    await screen.findByText(/Your video is getting ready/),
  ).toBeInTheDocument();
});
it("imports a valid video and opens its workspace", async () => {
  vi.mocked(api.uploadVideo).mockResolvedValue({
    ...project,
    status: "queued",
  });
  render(<App />);
  await screen.findByRole("button", { name: "Choose video" });
  await userEvent.upload(
    screen.getByLabelText("Import video file"),
    new File(["test"], "podcast.mp4", { type: "video/mp4" }),
  );
  expect(
    await screen.findByText("Your video is in the queue."),
  ).toBeInTheDocument();
  expect(window.location.pathname).toBe("/projects/ready");
  expect(
    screen.getByText(/Follow its preparation in Recent videos/),
  ).toBeInTheDocument();
  expect(document.querySelector(".recent-row.queue-arrival")).not.toBeNull();
});
it("removes a queued video with the title's x button and announces an empty queue", async () => {
  vi.mocked(api.listProjects).mockResolvedValue([
    { ...project, status: "queued" },
  ]);
  vi.mocked(api.removeQueuedVideo).mockResolvedValue({ status: "removed" });
  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Remove podcast.mp4 from queue",
    }),
  );
  expect(api.removeQueuedVideo).toHaveBeenCalledWith("ready");
  expect(
    await screen.findByText("No videos in the queue. You’re all caught up."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Remove podcast.mp4 from queue" }),
  ).not.toBeInTheDocument();
});
it("queues generation and navigates to the results page", async () => {
  window.history.replaceState(null, "", "/projects/ready");
  vi.mocked(api.listProjects).mockResolvedValue([project]);
  vi.mocked(api.generate).mockResolvedValue({
    id: "j",
    project_id: "ready",
    kind: "generate",
    status: "queued",
    stage: "Waiting",
    error: null,
    options: {},
  });
  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Generate shorts" }),
  );
  await waitFor(() =>
    expect(api.generate).toHaveBeenCalledWith("ready", defaultOptions),
  );
  expect(await screen.findByText("Your story, in shorts.")).toBeInTheDocument();
  expect(window.location.pathname).toBe("/projects/ready/shorts");
});
it("uses email signup while unavailable OAuth providers are disabled", async () => {
  vi.mocked(api.currentUser).mockRejectedValue(new Error("401"));
  vi.mocked(api.authenticate).mockResolvedValue(user);
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: "Sign in" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Create an account" }),
  );
  await userEvent.type(screen.getByLabelText("Your name"), "Creator");
  await userEvent.type(
    screen.getByLabelText("Email address"),
    "creator@example.com",
  );
  await userEvent.type(screen.getByLabelText("Password"), "test-password-123");
  expect(screen.getByText("Continue with Google").closest("a")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByRole("button", { name: "Choose video" });
  expect(api.authenticate).toHaveBeenCalledWith(
    true,
    "creator@example.com",
    "test-password-123",
    "Creator",
  );
});
it("opens the main workspace for visitors and asks for sign-in only at download", async () => {
  window.history.replaceState(null, "", "/projects/ready/shorts");
  vi.mocked(api.currentUser).mockRejectedValue(new Error("Please sign in"));
  vi.mocked(api.listProjects).mockResolvedValue([project]);
  vi.mocked(api.shorts).mockResolvedValue([short]);
  vi.mocked(api.saveShort).mockResolvedValue(short);
  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Edit short/ }),
  );
  await screen.findByLabelText("Short title");
  expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Sign in to download" }),
  );
  expect(await screen.findByLabelText("Email address")).toBeInTheDocument();
  expect(api.exportShort).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: /Back to editing/ }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: /Edit short/ }),
  );
  expect(await screen.findByLabelText("Short title")).toBeInTheDocument();
});
it("allows subtitles off and saves the exact displayed revision", async () => {
  const saved = vi.fn();
  vi.mocked(api.saveShort).mockResolvedValue({
    ...short,
    subtitles: false,
    revision: 2,
  });
  render(
    <ClipWorkspace
      short={short}
      jobs={[]}
      onSaved={saved}
      refresh={vi.fn()}
      onError={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("switch", { name: /Show subtitles/ }));
  await userEvent.click(screen.getByRole("button", { name: "Apply changes" }));
  expect(api.saveShort).toHaveBeenCalledWith({ ...short, subtitles: false });
  await waitFor(() => expect(saved).toHaveBeenCalled());
});
it("does not silently replace a stale draft when another tab edits a short", async () => {
  const props = {
    jobs: [],
    onSaved: vi.fn(),
    refresh: vi.fn(),
    onError: vi.fn(),
  };
  const view = render(<ClipWorkspace short={short} {...props} />);
  await userEvent.type(screen.getByLabelText("Short title"), " edited");
  view.rerender(
    <ClipWorkspace
      short={{ ...short, revision: 2, title: "Other tab title" }}
      {...props}
    />,
  );
  expect(screen.getByLabelText("Short title")).toHaveValue(
    "A thoughtful idea edited",
  );
  expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Load latest version" }),
  );
  expect(screen.getByLabelText("Short title")).toHaveValue("Other tab title");
});
it("shows three thumbnail choices and links to a dedicated editor", () => {
  render(
    <ClipWorkspace
      short={short}
      jobs={[]}
      onSaved={vi.fn()}
      refresh={vi.fn()}
      onError={vi.fn()}
    />,
  );
  expect(
    screen.getAllByRole("button", { name: /Choose thumbnail/ }),
  ).toHaveLength(3);
  expect(
    screen.getByRole("button", { name: /Edit cover/ }),
  ).toBeInTheDocument();
});
it("only offers downloads for ready exports of the current saved revision", () => {
  const job: api.Job = {
    id: "old",
    project_id: "ready",
    kind: "export",
    status: "ready",
    stage: "Ready",
    error: null,
    options: { short_id: "s1", revision: 0 },
  };
  render(
    <ClipWorkspace
      short={short}
      jobs={[job]}
      onSaved={vi.fn()}
      refresh={vi.fn()}
      onError={vi.fn()}
    />,
  );
  expect(screen.queryByText(/Your MP4 is ready/)).not.toBeInTheDocument();
});
it("shows a ready download when polling only updates export metadata", () => {
  const props = {
    jobs: [] as api.Job[],
    onSaved: vi.fn(),
    refresh: vi.fn(),
    onError: vi.fn(),
  };
  const view = render(<ClipWorkspace short={short} {...props} />);
  const job: api.Job = {
    id: "current",
    project_id: "ready",
    kind: "export",
    status: "ready",
    stage: "Ready",
    error: null,
    options: { short_id: short.id, revision: short.revision },
  };
  view.rerender(
    <ClipWorkspace
      short={{ ...short, export_revision: short.revision }}
      {...props}
      jobs={[job]}
    />,
  );
  expect(screen.getByText(/Your MP4 is ready/)).toBeInTheDocument();
});
it("persists a guest's cover edits before opening sign-in for JPG download", async () => {
  const requestSignIn = vi.fn();
  let finish!: (value: api.Short) => void;
  vi.mocked(api.shorts).mockResolvedValue([short]);
  vi.mocked(api.saveShort).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(
    <AuthGate.Provider value={{ isGuest: true, requestSignIn }}>
      <ThumbnailEditor project={project} shortId={short.id} onError={vi.fn()} />
    </AuthGate.Provider>,
  );
  const text = await screen.findByLabelText("Cover text");
  await userEvent.clear(text);
  await userEvent.type(text, "A cover worth keeping");
  await userEvent.selectOptions(screen.getByLabelText("Text style"), "clean");
  await userEvent.click(screen.getByRole("button", { name: "Download JPG" }));
  expect(api.saveShort).toHaveBeenCalledWith(
    expect.objectContaining({
      thumbnail_text: "A cover worth keeping",
      thumbnail_style: "clean",
    }),
  );
  expect(requestSignIn).not.toHaveBeenCalled();
  await act(async () => {
    finish({
      ...short,
      revision: 2,
      thumbnail_text: "A cover worth keeping",
      thumbnail_style: "clean",
    });
  });
  expect(requestSignIn).toHaveBeenCalledOnce();
});
