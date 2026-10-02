import { useEffect, useRef, useState } from "react";
import { Gamepad2, X } from "lucide-react";

type Phase = "idle" | "waiting" | "go" | "early" | "result" | "missed";

export default function ReactionGame({
  onClose,
  processing,
}: {
  onClose: () => void;
  processing: boolean;
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
    waiting: "Wait for teal…",
    go: "GO · tap now!",
    early: "A little early! Tap to try again.",
    result: `${result} ms · tap for another round`,
    missed: "No rush. Tap for another round.",
  };
  return (
    <section className="reaction-game" aria-label="Optional reaction game">
      <div className="reaction-heading">
        <strong>
          <Gamepad2 size={18} /> A tiny creative break
        </strong>
        <button
          className="icon-button"
          aria-label="Close reaction game"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p>
        {processing
          ? "Your shorts keep processing. Tap when the light turns teal."
          : "Processing has finished. Finish your round, or close this break to review your shorts."}
      </p>
      <button
        className={`reaction-pad reaction-${phase}`}
        onClick={press}
        aria-label={messages[phase]}
      >
        <span className="reaction-light" aria-hidden="true" />
        <span>{messages[phase]}</span>
      </button>
      <div className="reaction-score" role="status" aria-live="polite">
        {best === null
          ? "Mouse, touch, Enter or Space. No flashing lights."
          : `Session best: ${best} ms. Just for fun.`}
      </div>
    </section>
  );
}
