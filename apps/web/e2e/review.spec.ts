import { expect, test } from "@playwright/test";
test("three review directions and responsive upload screen", async ({
  page,
}) => {
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/?review");
  await expect(
    page.getByText("Three ways to find your next short."),
  ).toBeVisible();
  await page
    .getByRole("button")
    .filter({ hasText: "Start with a story" })
    .click();
  await expect(
    page.getByRole("button", { name: "Choose video" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Choose video" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("video import reaches persisted project workspace", async ({ page }) => {
  const project = {
    id: "test",
    filename: "podcast.mp4",
    size_bytes: 4,
    status: "queued",
    error: null,
    duration_seconds: null,
    width: null,
    height: null,
    has_audio: false,
    start_ms: 0,
    end_ms: 0,
    revision: 1,
  };
  let uploaded = false;
  await page.route("**/api/v1/projects*", async (route) => {
    if (route.request().method() === "POST") {
      uploaded = true;
      await route.fulfill({ status: 202, json: project });
    } else await route.fulfill({ json: uploaded ? [project] : [] });
  });
  await page.goto("/");
  await page.getByLabel("Import video file").setInputFiles({
    name: "podcast.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("test"),
  });
  await expect(page.getByText("Your video is in the queue.")).toBeVisible();
});
