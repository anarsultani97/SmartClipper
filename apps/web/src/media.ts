export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024;
export function simpleStage(stage: string): string {
  const labels: Record<string, string> = {
    "Waiting for worker": "Waiting to start",
    "Loading speech model / transcript": "Getting subtitles ready",
    "Loading speech model": "Getting subtitles ready",
    "Transcribing speech": "Writing subtitles",
    "Translating English captions": "Adding English subtitles",
    "Checking scenes and context": "Finding the best parts",
    "Selecting clear covers": "Choosing covers",
  };
  return labels[stage] || stage;
}
export type ImportLimits = {
  max_upload_bytes: number;
  max_duration_seconds: number;
};
export function formatSizeLimit(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit++;
  }
  return `${Number(bytes.toFixed(2))} ${units[unit]}`;
}
export function formatImportLimits(limits: ImportLimits | null): string {
  if (
    !limits ||
    !Number.isFinite(limits.max_upload_bytes) ||
    !Number.isFinite(limits.max_duration_seconds) ||
    limits.max_upload_bytes <= 0 ||
    limits.max_duration_seconds <= 0
  )
    return "Limits checked by the app service";
  return `up to ${formatSizeLimit(limits.max_upload_bytes)} · up to ${Number((limits.max_duration_seconds / 60).toFixed(2))} minutes`;
}
export function validateVideo(
  file: Pick<File, "name" | "size">,
  maxBytes = MAX_UPLOAD_BYTES,
): string | null {
  if (!file.name.toLowerCase().endsWith(".mp4")) return "Choose an MP4 video.";
  if (!file.size) return "This video is empty.";
  if (file.size > maxBytes)
    return `Choose a video no larger than ${formatSizeLimit(maxBytes)}.`;
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
