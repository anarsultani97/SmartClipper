import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReactionGame from "./ReactionGame";
import { WaitingGame } from "./WaitingGame";
import { ProgressRing } from "./ProgressRing";

describe("reaction game", () => {
  let now = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  function start() {
    fireEvent.click(screen.getByRole("button", { name: /Tap to start/ }));
    expect(
      screen.getByRole("button", { name: "Wait for green…" }),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1800));
  }
  it("celebrates a fast score and keeps the best score", () => {
    render(<ReactionGame onClose={vi.fn()} processing task="upload" />);
    expect(screen.getByText(/Your video is uploading/)).toBeInTheDocument();
    start();
    now = 250;
    fireEvent.click(screen.getByRole("button", { name: "Green! Tap now!" }));
    expect(screen.getByText("Great job! That was fast!")).toBeInTheDocument();
    expect(screen.getByText(/Best score: 250 ms/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /250 ms/ }));
    act(() => vi.advanceTimersByTime(1800));
    now = 1050;
    fireEvent.click(screen.getByRole("button", { name: "Green! Tap now!" }));
    expect(screen.queryByText(/Oops/)).not.toBeInTheDocument();
    expect(screen.getByText(/Best score: 250 ms/)).toBeInTheDocument();
  });
  it("shows slow feedback only for a very slow score", () => {
    render(<ReactionGame onClose={vi.fn()} processing />);
    start();
    now = 1600;
    fireEvent.click(screen.getByRole("button", { name: "Green! Tap now!" }));
    expect(screen.getByText("Oops, too slow. Try again!")).toBeInTheDocument();
    expect(screen.queryByText(/Great job/)).not.toBeInTheDocument();
  });
  it("cancels a round after an early click and on unmount", () => {
    const view = render(<ReactionGame onClose={vi.fn()} processing />);
    fireEvent.click(screen.getByRole("button", { name: /Tap to start/ }));
    fireEvent.click(screen.getByRole("button", { name: "Wait for green…" }));
    expect(
      screen.getByRole("button", { name: /Too soon/ }),
    ).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /Too soon/ }));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops timers when the tab is hidden", () => {
    render(<ReactionGame onClose={vi.fn()} processing />);
    start();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(
      screen.getByRole("button", { name: /Tap to start/ }),
    ).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("gives a gentle missed-round message", () => {
    render(<ReactionGame onClose={vi.fn()} processing />);
    start();
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByText("Oops, too slow. Try again!")).toBeInTheDocument();
  });
});

it("places Play game before the progress circle and keeps an open game after completion", async () => {
  const view = render(
    <WaitingGame active task="shorts">
      <ProgressRing value={37} label="Making shorts" />
    </WaitingGame>,
  );
  const button = screen.getByRole("button", { name: "Play game" });
  expect(
    button.compareDocumentPosition(screen.getByRole("progressbar")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.click(button);
  await screen.findByRole("button", { name: /Tap to start/ });
  view.rerender(
    <WaitingGame active={false} task="shorts">
      {null}
    </WaitingGame>,
  );
  expect(screen.getByText(/All done!/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close game" }));
  expect(
    screen.queryByRole("button", { name: "Hide game" }),
  ).not.toBeInTheDocument();
});
