import { expect, test } from "@playwright/test";
const user = {
  id: "u",
  name: "Creator",
  email: "creator@example.com",
  csrf: "test",
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ json: user }),
  );
  await page.route("**/api/v1/auth/providers", (route) =>
    route.fulfill({ json: { google: false, facebook: false } }),
  );
});
test("guided upload is responsive and old direction URLs no longer switch designs", async ({
  page,
}) => {
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/?review&design=studio");
  await expect(
    page.getByRole("button", { name: "Choose video" }),
  ).toBeVisible();
  await expect(page.getByLabel("Video language")).toBeVisible();
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
test("new visitors see the main page before sign-in and can return from the account page", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, json: { detail: "Sign in" } }),
  );
  await page.route("**/api/v1/auth/guest", (route) =>
    route.fulfill({ status: 201, json: { ...user, is_guest: true } }),
  );
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Choose video" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Continue with Google")).toBeVisible();
  await expect(page.getByText("Continue with Facebook")).toHaveCount(0);
  await page.getByRole("button", { name: /Back to editing/ }).click();
  await expect(
    page.getByRole("button", { name: "Choose video" }),
  ).toBeVisible();
});
test("video import opens the persisted project workspace", async ({ page }) => {
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
      expect(route.request().headers()["x-csrf-token"]).toBe("test");
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
  await expect(page).toHaveURL(/\/projects\/test$/);
  await expect(
    page.getByText(/Video uploaded! Follow its preparation/),
  ).toBeVisible();
  await expect(page.locator(".queue-arrival")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".recent-heading")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove podcast.mp4 from queue" }),
  ).toBeVisible();
});
test("queued videos can be removed and an empty queue is explained on mobile", async ({
  page,
}) => {
  let removed = false;
  const project = {
    id: "queued",
    filename: "queued.mp4",
    status: "processing",
    revision: 1,
    size_bytes: 4,
  };
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({ json: removed ? [] : [project] }),
  );
  await page.route("**/api/v1/projects/queued", (route) => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().headers()["x-csrf-token"]).toBe("test");
    removed = true;
    return route.fulfill({ status: 202, json: { status: "deleted" } });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Remove queued.mp4 from queue" })
    .click();
  await expect(page.getByText(/No videos in the queue/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove queued.mp4 from queue" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("results support subtitle toggles, thumbnails and a large preview", async ({
  page,
}) => {
  const project = {
    id: "p",
    filename: "podcast.mp4",
    size_bytes: 4,
    status: "ready",
    duration_seconds: 120,
    has_audio: true,
    revision: 1,
  };
  const short = {
    id: "s",
    project_id: "p",
    job_id: "j",
    title: "A story worth sharing",
    summary: ["Opening in context.", "The main idea.", "A complete ending."],
    start_ms: 10000,
    end_ms: 40000,
    thumbnails: [
      { index: 0, time_seconds: 12 },
      { index: 1, time_seconds: 20 },
      { index: 2, time_seconds: 30 },
    ],
    thumbnail: 0,
    thumbnail_style: "bold",
    thumbnail_text: "A story worth sharing",
    subtitles: true,
    subtitle_language: "original",
    music: "none",
    revision: 1,
    english_available: true,
    transcript: [],
    quality_note: "Review before sharing.",
  };
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({ json: [project] }),
  );
  await page.route("**/api/v1/projects/p/jobs", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/projects/p/shorts", (route) =>
    route.fulfill({ json: [short] }),
  );
  await page.goto("/projects/p/shorts");
  await expect(page.getByText("Opening in context.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose thumbnail 3" }),
  ).toBeVisible();
  await page.getByRole("switch").click();
  await expect(page.getByText("Captions off")).toBeVisible();
  const video = await page.locator("video").boundingBox();
  expect(video?.height).toBeGreaterThan(420);
  await page.getByRole("button", { name: /Edit cover/ }).click();
  await expect(page.getByText("Give your story a cover.")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("personal activity dashboard shows aggregate counts without a team switch", async ({
  page,
}) => {
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/analytics*", (route) =>
    route.fulfill({
      json: {
        scope: "me",
        can_view_team: false,
        user_id: "u",
        totals: { videos: 3, shorts: 10, exports: 4, customized_shorts: 2 },
        funnel: [{ label: "Videos imported", count: 3 }],
        jobs: [],
        daily: [],
        note: "Aggregate counts only.",
      },
    }),
  );
  await page.goto("/activity");
  await expect(page.getByText("Shorts generated")).toBeVisible();
  await expect(page.getByRole("button", { name: /All users/ })).toHaveCount(0);
});
