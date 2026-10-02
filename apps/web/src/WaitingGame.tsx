import { lazy, Suspense, useState, type ReactNode } from "react";
import { Gamepad2 } from "lucide-react";

const ReactionGame = lazy(() => import("./ReactionGame"));

export function WaitingGame({
  active,
  task,
  children,
}: {
  active: boolean;
  task: "upload" | "video" | "shorts";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="waiting-game">
      {(active || open) && (
        <div className="waiting-game-control">
          <button
            className={`secondary game-trigger ${open ? "" : "game-glow"}`}
            onClick={() => setOpen((old) => !old)}
            aria-expanded={open}
          >
            <Gamepad2 size={19} /> {open ? "Hide game" : "Play game"}
          </button>
        </div>
      )}
      {children}
      {open && (
        <Suspense fallback={<p className="hint">Loading game…</p>}>
          <ReactionGame
            onClose={() => setOpen(false)}
            processing={active}
            task={task}
          />
        </Suspense>
      )}
    </div>
  );
}
