export function ProgressRing({
  value,
  label,
  detail,
  compact = false,
}: {
  value: number;
  label: string;
  detail?: string;
  compact?: boolean;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={`progress-ring ${compact ? "compact" : ""}`}>
      <div
        className="ring-meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="ring-track" cx="60" cy="60" r="51" />
          <circle
            className="ring-fill"
            cx="60"
            cy="60"
            r="51"
            pathLength="100"
            strokeDasharray={`${percent} 100`}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <strong>
          {percent}
          <small>%</small>
        </strong>
      </div>
      <div className="ring-copy">
        <h3>{label}</h3>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}
