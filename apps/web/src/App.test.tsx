import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import * as api from "./api";
vi.mock("./api", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  uploadVideo: vi.fn(),
  mediaUrl: (id: string, kind: string) => "/media/" + id + "/" + kind,
  saveSelection: vi.fn(),
  retryProject: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listProjects).mockResolvedValue([]);
  window.history.replaceState(null, "", "/");
});
it("shows the guided upload and truthful empty library", async () => {
  render(<App />);
  expect(screen.getByText("Long story. Short format.")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Choose video" }),
  ).toBeInTheDocument();
  await waitFor(() => expect(api.listProjects).toHaveBeenCalled());
  expect(
    screen.getByText("Your imported videos will be saved here."),
  ).toBeInTheDocument();
});
it("rejects an invalid upload before calling the API", async () => {
  render(<App />);
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(
    screen.getByLabelText("Import video file"),
    new File(["test"], "audio.mp3"),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Choose an MP4 video.",
  );
  expect(api.uploadVideo).not.toHaveBeenCalled();
});
it("opens all three review directions", async () => {
  window.history.replaceState(null, "", "/?review");
  render(<App />);
  expect(
    screen.getByText("Three ways to find your next short."),
  ).toBeInTheDocument();
  const cards = screen.getAllByRole("button");
  expect(cards).toHaveLength(3);
  await userEvent.click(cards[2]);
  expect(
    screen.getByText("Ready when inspiration strikes."),
  ).toBeInTheDocument();
});
it("imports a valid MP4 and shows queued state", async () => {
  const p = {
    id: "one",
    filename: "talk.mp4",
    status: "queued",
    size_bytes: 4,
    error: null,
    duration_seconds: null,
    width: null,
    height: null,
    has_audio: false,
    start_ms: 0,
    end_ms: 0,
    revision: 1,
  };
  vi.mocked(api.uploadVideo).mockResolvedValue(p);
  vi.mocked(api.listProjects).mockResolvedValue([p]);
  render(<App />);
  await userEvent.upload(
    screen.getByLabelText("Import video file"),
    new File(["test"], "talk.mp4", { type: "video/mp4" }),
  );
  expect(
    await screen.findByText("Your video is in the queue."),
  ).toBeInTheDocument();
  expect(api.uploadVideo).toHaveBeenCalledTimes(1);
});
it("saves a valid selection using the displayed revision", async () => {
  const p = {
    id: "ready",
    filename: "ready.mp4",
    size_bytes: 20,
    status: "ready",
    error: null,
    duration_seconds: 100,
    width: 1920,
    height: 1080,
    has_audio: true,
    start_ms: 0,
    end_ms: 60000,
    revision: 1,
  };
  vi.mocked(api.listProjects).mockResolvedValue([p]);
  vi.mocked(api.saveSelection).mockResolvedValue({
    ...p,
    start_ms: 2000,
    end_ms: 8000,
    revision: 2,
  });
  render(<App />);
  await userEvent.click(
    (await screen.findAllByRole("button", { name: /ready.mp4/ }))[0],
  );
  const start = screen.getByLabelText("Selection start seconds");
  const end = screen.getByLabelText("Selection end seconds");
  await userEvent.clear(start);
  await userEvent.type(start, "2");
  await userEvent.clear(end);
  await userEvent.type(end, "8");
  await userEvent.click(screen.getByRole("button", { name: "Save selection" }));
  expect(
    await screen.findByRole("button", { name: "Selection saved" }),
  ).toBeInTheDocument();
  expect(api.saveSelection).toHaveBeenCalledWith(
    expect.objectContaining({ revision: 1 }),
    2000,
    8000,
  );
});
