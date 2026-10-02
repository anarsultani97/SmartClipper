import { useEffect, useRef, useState } from "react";
import { Link2, LoaderCircle, X } from "lucide-react";
import * as api from "./api";
import { formatImportLimits, type ImportLimits } from "./media";

export function LinkImport({
  onClose,
  onImported,
  limits = null,
}: {
  onClose: () => void;
  onImported: (project: api.Project) => void;
  limits?: ImportLimits | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    return () => {
      mounted.current = false;
      dialog.current?.close();
    };
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const project = await api.importVideoLink(url.trim());
      if (!mounted.current) return;
      onImported(project);
      onClose();
    } catch (e) {
      if (!mounted.current) return;
      setError(
        e instanceof Error ? e.message : "This link could not be added.",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="link-import-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="link-import-title"
    >
      <div className="section-heading">
        <span className="step-label">
          <Link2 size={15} /> IMPORT FROM A LINK
        </span>
        <button
          className="text-button"
          aria-label="Close link import"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <h2 id="link-import-title">A link. A new story.</h2>
      <p>
        Paste a public YouTube video or Short, TikTok, Instagram Reel or
        Facebook video.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          Video link
          <input
            autoFocus
            type="url"
            required
            maxLength={2048}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </label>
        {error && (
          <p role="alert" className="editor-validation">
            {error}
          </p>
        )}
        <p className="hint">
          {formatImportLimits(limits)}. Use videos you’re allowed to reuse.
          Private or sign-in-only links may require an MP4 upload.
        </p>
        <button
          className="primary"
          type="submit"
          disabled={busy || !url.trim()}
        >
          {busy ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <Link2 size={18} />
          )}{" "}
          {busy ? "Adding your video…" : "Import video link"}
        </button>
      </form>
    </dialog>
  );
}
