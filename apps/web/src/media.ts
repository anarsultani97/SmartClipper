export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024;
export function validateVideo(
  file: Pick<File, "name" | "size">,
): string | null {
  if (!file.name.toLowerCase().endsWith(".mp4")) return "Choose an MP4 video.";
  if (!file.size) return "This video is empty.";
  if (file.size > MAX_UPLOAD_BYTES)
    return "Choose a video no larger than 3 GB.";
  return null;
}
export function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const h = Math.floor(value / 3600),
    m = Math.floor((value % 3600) / 60),
    s = value % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
export function validSelection(
  start: number,
  end: number,
  duration: number,
): boolean {
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end > start &&
    end <= duration
  );
}
