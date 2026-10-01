import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { App, Preferences, defaultOptions } from "./App";
import { ClipWorkspace } from "./ClipWorkspace";
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
  window.history.replaceState(null, "", "/");
  vi.mocked(api.currentUser).mockResolvedValue(user);
  vi.mocked(api.listProjects).mockResolvedValue([]);
  vi.mocked(api.providers).mockResolvedValue({
    google: false,
    facebook: false,
  });
  vi.mocked(api.jobs).mockResolvedValue([]);
  vi.mocked(api.shorts).mockResolvedValue([]);
  vi.mocked(api.mediaUrl).mockImplementation(
    (id, kind) => `/media/${id}/${kind}`,
  );
  vi.mocked(api.shortMedia).mockImplementation(
    (id, kind) => `/short/${id}/${kind}`,
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
it("shows eleven languages including Turkish, auto-detection and English subtitles", async () => {
  const change = vi.fn();
  render(<Preferences value={defaultOptions} onChange={change} />);
  expect(
    screen.getByLabelText("Video language").querySelectorAll("option"),
  ).toHaveLength(12);
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
it("shows a real upload percentage and accessible progress bar until upload completes", async () => {
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
  expect(
    screen.getByRole("button", { name: "Cancel upload" }),
  ).toBeInTheDocument();
  await act(async () => {
    finish?.({ ...project, status: "queued" });
  });
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
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
  await userEvent.click(screen.getByRole("switch"));
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
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
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
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
