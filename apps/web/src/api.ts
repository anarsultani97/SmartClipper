import type { components } from "./generated/api";
export type Project = components["schemas"]["ProjectView"];
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
};
export type Job = components["schemas"]["JobView"];
export type Short = components["schemas"]["ShortView"];
let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};
const base = "/api/v1";
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(base + path, {
    ...init,
    headers: { ...init?.headers, ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
  });
  const data = await response.json().catch(() => {
    throw new Error(
      "We couldn't reach the app service. Please try again shortly.",
    );
  });
  if (!response.ok) {
    throw new Error(
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
    );
  }
  return data;
}
export const listProjects = () => request<Project[]>("/projects");
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
export const authenticate = (
  signup: boolean,
  email: string,
  password: string,
  name: string,
) =>
  request<User>(
    signup ? "/auth/signup" : "/auth/login",
    json("POST", { email, password, name }),
  );
export const logout = () => request("/auth/logout", { method: "POST" });
export const generate = (id: string, options: Options) =>
  request<Job>(`/projects/${id}/generate`, json("POST", options));
export const jobs = (id: string) => request<Job[]>(`/projects/${id}/jobs`);
export const shorts = (id: string) =>
  request<Short[]>(`/projects/${id}/shorts`);
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
      music: short.music,
      thumbnail: short.thumbnail,
      thumbnail_style: short.thumbnail_style,
      thumbnail_text: short.thumbnail_text,
    }),
  );
export const exportShort = (id: string) =>
  request<Job>(`/shorts/${id}/export`, { method: "POST" });
export const shortMedia = (id: string, kind: string, job?: string) =>
  `${base}/shorts/${id}/media/${kind}${job ? `?job_id=${encodeURIComponent(job)}` : ""}`;
export const captionsUrl = (id: string, language: string) =>
  `${base}/shorts/${id}/captions/${language}`;
export const uploadThumbnail = (short: Short, file: File) =>
  request<Short>(`/shorts/${short.id}/thumbnail?revision=${short.revision}`, {
    method: "PUT",
    body: file,
  });
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
