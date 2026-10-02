import { describe, expect, it } from "vitest";
import {
  formatTime,
  formatImportLimits,
  MAX_UPLOAD_BYTES,
  validateVideo,
  validSelection,
} from "./media";

describe("video validation", () => {
  it("accepts uppercase MP4", () =>
    expect(validateVideo({ name: "Podcast.MP4", size: 10 })).toBeNull());
  it("uses the configured upload limit", () => {
    expect(
      validateVideo({ name: "test.mp4", size: 1024 ** 2 + 1 }, 1024 ** 2),
    ).toMatch(/1 MB/);
  });
  it("rejects empty, oversized and non-MP4 files", () => {
    expect(validateVideo({ name: "test.mp4", size: 0 })).toMatch(/empty/);
    expect(
      validateVideo({ name: "test.mp4", size: MAX_UPLOAD_BYTES + 1 }),
    ).toMatch(/3 GB/);
    expect(validateVideo({ name: "test.mov", size: 10 })).toMatch(/MP4/);
  });
  it("accepts a 2.5 GB video and the exact 3 GB limit without allocating its contents", () => {
    expect(
      validateVideo({ name: "large.mp4", size: 2.5 * 1024 ** 3 }),
    ).toBeNull();
    expect(
      validateVideo({ name: "limit.mp4", size: MAX_UPLOAD_BYTES }),
    ).toBeNull();
  });
});
describe("service import limits", () => {
  it("displays the configured duration and size", () => {
    expect(
      formatImportLimits({
        max_upload_bytes: 3 * 1024 ** 3,
        max_duration_seconds: 3600,
      }),
    ).toBe("up to 3 GB · up to 60 minutes");
  });
  it("does not invent limits when the service is unavailable or invalid", () => {
    expect(formatImportLimits(null)).toBe("Limits checked by the app service");
    expect(
      formatImportLimits({
        max_upload_bytes: 3 * 1024 ** 3,
        max_duration_seconds: NaN,
      }),
    ).toBe("Limits checked by the app service");
  });
});
describe("source time", () => {
  it("formats minutes and hours", () => {
    expect(formatTime(65.5)).toBe("1:05");
    expect(formatTime(3661)).toBe("1:01:01");
  });
  it("validates timeline selections", () => {
    expect(validSelection(12, 48, 100)).toBe(true);
    expect(validSelection(48, 12, 100)).toBe(false);
    expect(validSelection(-1, 12, 100)).toBe(false);
    expect(validSelection(1, 101, 100)).toBe(false);
    expect(validSelection(NaN, 10, 100)).toBe(false);
  });
});
