import { Megaphone } from "lucide-react";

export function AdPreview() {
  return (
    <aside className="ad-preview" aria-label="Sample ad banner">
      <span className="ad-label">AD PREVIEW</span>
      <Megaphone size={24} aria-hidden="true" />
      <div>
        <strong>Space for a future sponsor</strong>
        <p>Sample banner. No live ads yet.</p>
      </div>
    </aside>
  );
}
