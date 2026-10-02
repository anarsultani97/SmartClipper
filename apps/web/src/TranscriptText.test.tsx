import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { plainSummary, TranscriptText } from "./TranscriptText";

it("removes only the generated introductions on older summaries", () => {
  expect(plainSummary("The excerpt opens with: “A true story.”.")).toBe(
    "A true story.",
  );
  expect(plainSummary("The speaker continues: “Another sentence.”.")).toBe(
    "Another sentence.",
  );
  expect(plainSummary("The excerpt closes with: “The ending.”.")).toBe(
    "The ending.",
  );
  expect(plainSummary("The speaker said hello.")).toBe(
    "The speaker said hello.",
  );
});
it("keeps the full text and highlights repeated words without adding labels or times", () => {
  const text =
    "Gardening brings joy. Gardening helps us relax. These flowers smell lovely.";
  const { container } = render(<TranscriptText text={text} />);
  expect(container.textContent).toBe(text);
  expect(container.querySelectorAll("mark")).toHaveLength(2);
  expect(screen.queryByText(/opens with/)).not.toBeInTheDocument();
});
it("renders untrusted and multilingual speech as text", () => {
  const text = "Türkçe sözler. العربية. <script>alert(1)</script>";
  const { container } = render(<TranscriptText text={text} />);
  expect(container.textContent).toBe(text);
  expect(container.querySelector("script")).toBeNull();
});
