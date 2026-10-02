import type { components } from "./generated/api";
type OptionalDefaults<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
// Cached records and older clients can omit newly defaulted fields.
export type Project = OptionalDefaults<
  components["schemas"]["ProjectView"],
  "progress" | "stage" | "shorts_count" | "video_edits"
>;
export type User = {
  id: string;
  name: string;
  email: string;
  csrf: string;
  is_guest?: boolean;
};
export type Options = {
  language: string;
  platform: string;
  duration_seconds: number;
  count: number;
  english_subtitles: boolean;
  transcription_mode?: "fast" | "balanced" | "accurate";
  vocabulary?: string;
  thumbnail_focus?: "auto" | "people" | "gameplay" | "scene";
};
export type Job = OptionalDefaults<
  components["schemas"]["JobView"],
  "progress" | "ready_count" | "planned_count"
>;
type Thumbnail = OptionalDefaults<
  components["schemas"]["ThumbnailView"],
  "faces" | "reason" | "framing"
>;
export type Short = Omit<
  OptionalDefaults<
    components["schemas"]["ShortView"],
    "caption_style" | "caption_position" | "video_edits" | "audio_edits"
  >,
  "thumbnails"
> & { thumbnails: Thumbnail[] };
export type VideoEdits = components["schemas"]["VideoEdits"];
export type AudioEdits = components["schemas"]["AudioEdits"];
export type AudioAsset = components["schemas"]["AudioAssetView"];
let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};
const base = "/api/v1";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(base + path, {
      ...init,
      credentials: "same-origin",
      headers: { ...init?.headers, ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
    });
  } catch {
    throw new ApiError(
      "We couldn't reach the app service. Check your connection and try again.",
      0,
    );
  }
  const data = await response.json().catch(() => {
    throw new Error(
      "We couldn't reach the app service. Please try again shortly.",
    );
  });
  if (!response.ok) {
    if (typeof data.detail?.message === "string") {
      throw new ApiError(
        data.detail.message,
        response.status,
        data.detail.code,
        data.detail.field,
      );
    }
    throw new ApiError(
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail
              .map(
                (item: { loc?: string[]; msg?: string }) =>
                  `${item.loc?.at(-1) || "Input"}: ${item.msg || "Check this value."}`,
              )
              .join(" ")
          : "The request could not be completed.",
      response.status,
    );
  }
  return data;
}
export const listProjects = () => request<Project[]>("/projects");
export const importVideoLink = (url: string) =>
  request<Project>("/projects/link", json("POST", { url }));
export const removeQueuedVideo = (id: string) =>
  request(`/projects/${id}`, { method: "DELETE" });
const json = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const currentUser = () => request<User>("/auth/me");
export const guestWorkspace = () =>
  request<User>("/auth/guest", { method: "POST" });
export const providers = () =>
  request<{ google: boolean; facebook: boolean }>("/auth/providers");
export const authenticate = async (
  signup: boolean,
  email: string,
  password: string,
  name: string,
) => {
  // Read the current cookie's token, rather than submitting a stale guest CSRF
  // token after another tab signs in/out. Never create a new guest here.
  try {
    const current = await currentUser();
    setCsrf(current.csrf);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error;
    setCsrf("");
  }
  const user = await request<User>(
    signup ? "/auth/signup" : "/auth/login",
    json("POST", { email, password, name }),
  );
  setCsrf(user.csrf);
  return user;
};
export const logout = () => request("/auth/logout", { method: "POST" });
export const generate = (id: string, options: Options) =>
  request<Job>(`/projects/${id}/generate`, json("POST", options));
export const jobs = (id: string) => request<Job[]>(`/projects/${id}/jobs`);
export const shorts = (id: string, jobId?: string) =>
  request<Short[]>(
    `/projects/${id}/shorts${jobId ? `?job_id=${encodeURIComponent(jobId)}` : ""}`,
  );
export const retryJob = (id: string) =>
  request<Job>(`/jobs/${id}/retry`, { method: "POST" });
export const uploadTranscript = (id: string, srt: string, language: string) =>
  request(`/projects/${id}/transcript`, json("PUT", { srt, language }));
export const saveShort = (short: Short) =>
  request<Short>(
    `/shorts/${short.id}`,
    json("PATCH", {
      revision: short.revision,
      title: short.title,
      subtitles: !!short.subtitles,
      subtitle_language: short.subtitle_language,
      caption_style: short.caption_style,
      caption_position: short.caption_position,
      music: short.music,
      thumbnail: short.thumbnail,
      thumbnail_style: short.thumbnail_style,
      thumbnail_text: short.thumbnail_text,
      video_edits: short.video_edits,
      audio_edits: short.audio_edits,
    }),
  );
export const saveProjectEdits = (project: Project, edits: VideoEdits) =>
  request<Project>(
    `/projects/${project.id}/selection`,
    json("PATCH", {
      revision: project.revision,
      start_ms: edits.trim_start_ms,
      end_ms:
        edits.trim_end_ms ?? Math.floor((project.duration_seconds || 0) * 1000),
      video_edits: edits,
    }),
  );
export const exportShort = (id: string) =>
  request<Job>(`/shorts/${id}/export`, { method: "POST" });
export const shortMedia = (id: string, kind: string, job?: string) =>
  `${base}/shorts/${id}/media/${kind}${job ? `?job_id=${encodeURIComponent(job)}` : ""}`;
export const captionsUrl = (id: string, language: string) =>
  `${base}/shorts/${id}/captions/${language}`;
export type Caption = components["schemas"]["Caption"];
export type CaptionGroup = {
  start: number;
  end: number;
  text: string;
  words: NonNullable<Caption["words"]>;
};
export const captionData = (id: string, language: string) =>
  request<{ segments: Caption[]; groups: CaptionGroup[] }>(
    `/shorts/${id}/caption-data/${language}`,
  );
export const saveCaptions = (
  short: Short,
  language: string,
  segments: Caption[],
) =>
  request<Short>(
    `/shorts/${short.id}/captions`,
    json("PUT", { revision: short.revision, language, segments }),
  );
export const uploadThumbnail = (short: Short, file: File) =>
  request<Short>(`/shorts/${short.id}/thumbnail?revision=${short.revision}`, {
    method: "PUT",
    body: file,
  });
export const audioAssets = (id: string) =>
  request<AudioAsset[]>(`/shorts/${id}/audio`);
export const uploadAudio = (id: string, kind: "music" | "voice", file: File) =>
  request<AudioAsset>(
    `/shorts/${id}/audio?kind=${kind}&filename=${encodeURIComponent(file.name)}`,
    { method: "POST", body: file },
  );
export const audioMedia = (id: string, asset: string) =>
  `${base}/shorts/${id}/audio/${asset}`;
export type MusicTrack = {
  id: string;
  name: string;
  mood: string;
  recommendation: string;
  license: string;
};
export const musicLibrary = () => request<MusicTrack[]>("/music");
export const musicPreview = (id: string) => `${base}/music/${id}/preview`;
export type Analytics = {
  scope: string;
  can_view_team: boolean;
  user_id: string;
  totals: {
    videos: number;
    shorts: number;
    exports: number;
    customized_shorts: number;
    failed_jobs: number;
    registered_users: number | null;
  };
  funnel: { label: string; count: number }[];
  jobs: { kind: string; status: string; count: number }[];
  daily: { day: string; kind: string; count: number }[];
  note: string;
};
export const analytics = (scope = "me") =>
  request<Analytics>(`/analytics?scope=${scope}`);
export const saveSelection = (p: Project, start_ms: number, end_ms: number) =>
  request<Project>(`/projects/${p.id}/selection`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_ms, end_ms, revision: p.revision }),
  });
export const retryProject = (id: string) =>
  request<Project>(`/projects/${id}/retry`, { method: "POST" });
export const mediaUrl = (id: string, kind: string) =>
  `${base}/projects/${id}/media/${kind}`;
export function uploadVideo(
  file: File,
  progress: (percent: number) => void,
  signal: AbortSignal,
): Promise<Project> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort);
    xhr.open(
      "POST",
      `${base}/projects?filename=${encodeURIComponent(file.name)}`,
    );
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    if (csrf) xhr.setRequestHeader("X-CSRF-Token", csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      cleanup();
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else
          reject(
            new Error(
              typeof data.detail === "string" ? data.detail : "Import failed.",
            ),
          );
      } catch {
        reject(new Error("The server returned an unreadable response."));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error("Connection lost. Check the API and try again."));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new Error("Upload cancelled."));
    };
    if (signal.aborted) {
      cleanup();
      reject(new Error("Upload cancelled."));
      return;
    }
    xhr.send(file);
  });
}
