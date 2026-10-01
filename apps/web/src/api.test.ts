import { afterEach, expect, it, vi } from "vitest";
import { authenticate, currentUser } from "./api";

afterEach(() => vi.unstubAllGlobals());

it("explains unavailable API responses instead of exposing JSON parsing errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("<html>Wrong dev server</html>", { status: 200 }),
      ),
  );
  await expect(currentUser()).rejects.toThrow(
    "We couldn't reach the app service",
  );
});

it("shows field validation feedback without echoing the submitted password", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [
            {
              loc: ["body", "password"],
              msg: "String should have at least 8 characters",
              input: "secret",
            },
          ],
        }),
        { status: 422 },
      ),
    ),
  );
  await expect(
    authenticate(true, "a@example.com", "secret", "A"),
  ).rejects.toThrow("password: String should have at least 8 characters");
});
