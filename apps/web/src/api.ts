import type { components } from "./generated/api";
export type Project = components["schemas"]["ProjectView"];
const base = "/api/v1";
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(base + path, init);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "The request could not be completed.",
    );
  }
  return response.json();
}
export const listProjects = () => request<Project[]>("/projects");
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
