import { useEffect, useRef, useState } from "react";
import { Frown, Gamepad2, PartyPopper, X } from "lucide-react";

type Phase = "idle" | "waiting" | "go" | "early" | "result" | "missed";

export default function ReactionGame({
  onClose,
  processing,
  task = "shorts",
}: {
  onClose: () => void;
  processing: boolean;
  task?: "upload" | "video" | "shorts";
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const started = useRef(0);
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const change = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  useEffect(() => {
    const pause = () => {
      if (!document.hidden) return;
      clear();
      change("idle");
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", pause);
    };
  }, []);
  const press = () => {
    if (phaseRef.current === "waiting") {
      clear();
      change("early");
      return;
    }
    if (phaseRef.current === "go") {
      clear();
      const ms = Math.round(performance.now() - started.current);
      setResult(ms);
      setBest((old) => (old === null ? ms : Math.min(old, ms)));
      change("result");
      return;
    }
    clear();
    change("waiting");
    timer.current = window.setTimeout(
      () => {
        started.current = performance.now();
        change("go");
        timer.current = window.setTimeout(() => change("missed"), 10000);
      },
      1800 + Math.random() * 2200,
    );
  };
  const messages: Record<Phase, string> = {
    idle: "Ready when you are. Tap to start.",
    waiting: "Wait for green…",
    go: "Green! Tap now!",
    early: "Too soon! Tap to try again.",
    result: `${result} ms · tap for another round`,
    missed: "Missed it. Tap to try again.",
  };
  const good = phase === "result" && result <= 300;
  const slow = (phase === "result" && result >= 1500) || phase === "missed";
  const taskText =
    task === "upload"
      ? "Your video is uploading."
      : task === "video"
        ? "Your video is getting ready."
        : "We are making your shorts.";
  return (
    <section className="reaction-game" aria-label="Optional reaction game">
      <div className="reaction-heading">
        <strong>
          <Gamepad2 size={18} /> Play game
        </strong>
        <button
          className="icon-button"
          aria-label="Close game"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p>
        {processing
          ? `${taskText} Tap when the light turns green.`
          : "All done! Finish your game, or close it to see your video."}
      </p>
      <button
        className={`reaction-pad reaction-${phase}`}
        onClick={press}
        aria-label={messages[phase]}
      >
        <span className="reaction-light" aria-hidden="true" />
        <span>{messages[phase]}</span>
      </button>
      {(good || slow) && (
        <div
          className={`game-feedback ${good ? "game-win" : "game-slow"}`}
          role="status"
        >
          {good ? (
            <PartyPopper size={24} aria-hidden="true" />
          ) : (
            <Frown size={24} aria-hidden="true" />
          )}
          <strong>
            {good ? "Great job! That was fast!" : "Oops, too slow. Try again!"}
          </strong>
          {good && (
            <div className="game-confetti" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          )}
        </div>
      )}
      <div className="reaction-score" role="status" aria-live="polite">
        {best === null
          ? "Click, tap, or press Enter or Space."
          : `Best score: ${best} ms. Lower is better.`}
      </div>
    </section>
  );
}
