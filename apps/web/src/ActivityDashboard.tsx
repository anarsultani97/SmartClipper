import { useEffect, useState } from "react";
import {
  ChartNoAxesCombined,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import * as api from "./api";

export function ActivityDashboard() {
  const [scope, setScope] = useState("me");
  const [data, setData] = useState<api.Analytics | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setData(await api.analytics(scope));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dashboard unavailable.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    setBusy(true);
    api
      .analytics(scope)
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [scope]);
  return (
    <>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">
            <ChartNoAxesCombined size={14} /> YOUR CREATIVE RHYTHM
          </span>
          <h1>A little look at the big picture.</h1>
          <p>
            Imports, suggestions, and exports. Just the activity that helps.
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {!data ? (
        <div className="loading-screen">
          <LoaderCircle className="spin" />
          Loading activity…
        </div>
      ) : (
        <>
          <div className="dashboard-tabs">
            <button
              className={`secondary ${scope === "me" ? "active" : ""}`}
              onClick={() => setScope("me")}
            >
              My activity
            </button>
            {data.can_view_team && (
              <button
                className={`secondary ${scope === "team" ? "active" : ""}`}
                onClick={() => setScope("team")}
              >
                All users · operator view
              </button>
            )}
          </div>
          <div className="dashboard-grid">
            {[
              ["Videos imported", data.totals.videos],
              ["Shorts generated", data.totals.shorts],
              ["Exports rendered", data.totals.exports],
              ["Shorts customized", data.totals.customized_shorts],
            ].map(([label, value]) => (
              <div className="card metric-card" key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <section className="card dashboard-panel">
            <div className="section-heading">
              <h2>From video to something shareable.</h2>
              <span className="quiet-badge">
                <ShieldCheck size={14} /> Aggregates only
              </span>
            </div>
            {data.funnel.map((row) => (
              <div className="funnel-row" key={row.label}>
                <span>{row.label}</span>
                <div className="funnel-track">
                  <span
                    style={{
                      width: `${(row.count / Math.max(1, data.totals.videos)) * 100}%`,
                    }}
                  />
                </div>
                <strong>{row.count}</strong>
              </div>
            ))}
          </section>
          <section className="card dashboard-panel">
            <h2>Processing health</h2>
            <div className="platform-row">
              {data.jobs.length ? (
                data.jobs.map((row) => (
                  <span key={row.kind + row.status}>
                    {row.kind === "generate" ? "Generation" : "Export"} ·{" "}
                    {row.status}
                    <strong>{row.count}</strong>
                  </span>
                ))
              ) : (
                <p>No processing jobs yet. Start with your first video.</p>
              )}
            </div>
            {scope === "team" && (
              <p className="hint">
                Registered accounts: {data.totals.registered_users}
              </p>
            )}
          </section>
          <section className="card dashboard-panel">
            <h2>Daily activity · last 30 days</h2>
            {data.daily.length ? (
              <div className="table-scroll">
                <table className="activity-table">
                  <thead>
                    <tr>
                      <th>Date (UTC)</th>
                      <th>Action</th>
                      <th>Requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((row) => (
                      <tr key={row.day + row.kind}>
                        <td>{row.day}</td>
                        <td>
                          {row.kind === "generate"
                            ? "Generate shorts"
                            : "Render export"}
                        </td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                Your activity will appear here as you generate and export
                shorts.
              </p>
            )}
            <p className="hint">{data.note}</p>
          </section>
          <p className="hint">
            This dashboard reads existing database records when opened or
            refreshed. No tracking scripts, video data, or third-party analytics
            are loaded. Your account ID for operator configuration:{" "}
            {data.user_id}
          </p>
        </>
      )}
    </>
  );
}
