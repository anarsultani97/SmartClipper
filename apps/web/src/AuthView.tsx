import { useEffect, useState } from "react";
import {
  ArrowRight,
  Captions,
  Clapperboard,
  LoaderCircle,
  Scissors,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import * as api from "./api";

export function AuthView({
  onLogin,
  onBack,
}: {
  onLogin: (user: api.User) => void;
  onBack?: () => void;
}) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const oauthError = new URLSearchParams(window.location.search).get(
    "auth_error",
  );
  const [error, setError] = useState(
    oauthError === "account_exists"
      ? "This email already has an account. Use its original sign-in method."
      : oauthError
        ? "Google sign-in could not be completed. Please try again, or continue with email."
        : "",
  );
  const returnQuery = new URLSearchParams(window.location.search);
  returnQuery.delete("signin");
  returnQuery.delete("auth_error");
  const returnPath =
    window.location.pathname + (returnQuery.size ? `?${returnQuery}` : "");
  const [providers, setProviders] = useState({
    google: false,
    facebook: false,
  });
  useEffect(() => {
    api
      .providers()
      .then(setProviders)
      .catch(() =>
        setError("The server is unavailable. Start the API and try again."),
      );
  }, []);
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Scissors size={22} />
          </span>
          Clivvy<span className="beta">BETA</span>
        </a>
        <div>
          <span className="eyebrow">BIG STORIES. LITTLE MOMENTS.</span>
          <h1>
            Your next great short
            <br />
            is already in
            <br />
            <em>your video.</em>
          </h1>
          <p>
            Bring the story. We’ll help you find the moments,
            <br />
            keep the context, and make the cut yours.
          </p>
          <div className="auth-features">
            <span>
              <Clapperboard />
              Thoughtful short suggestions
            </span>
            <span>
              <Captions />
              Eleven languages & English captions
            </span>
            <span>
              <ShieldCheck />A private workspace for your videos
            </span>
          </div>
        </div>
        <blockquote>
          “Keep the story. Skip the scrolling.”
          <small>The Clivvy editing philosophy</small>
        </blockquote>
      </section>
      <section className="auth-form">
        {onBack && (
          <button type="button" className="back-link" onClick={onBack}>
            ← Back to editing
          </button>
        )}
        <span className="eyebrow">
          <Sparkles size={15} /> YOUR CREATIVE CORNER
        </span>
        <h2>{signup ? "Make room for your story." : "Good to see you."}</h2>
        <p>
          {signup
            ? "Create your account to keep your videos and download your shorts."
            : "Sign in to download your shorts. Your work will come with you."}
        </p>
        <div className="oauth-buttons">
          {(["google"] as const).map((provider) => (
            <a
              key={provider}
              className={`secondary ${providers[provider] ? "" : "disabled"}`}
              href={
                providers[provider]
                  ? `/api/v1/auth/${provider}/start?return_to=${encodeURIComponent(returnPath)}`
                  : undefined
              }
              aria-disabled={!providers[provider]}
            >
              G<span>Continue with Google</span>
              {!providers[provider] && <small>Available soon</small>}
            </a>
          ))}
        </div>
        <div className="divider">
          <span>or continue with email</span>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              onLogin(
                await api.authenticate(
                  signup,
                  email.trim(),
                  password,
                  name || "Creator",
                ),
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : "Sign-in failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {signup && (
            <label>
              Your name
              <input
                autoComplete="name"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              aria-label="Password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={signup ? 8 : 1}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {signup && <small>At least 8 characters.</small>}
          </label>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ArrowRight size={18} />
            )}{" "}
            {signup ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          {signup ? "Already have an account?" : "New around here?"}{" "}
          <button
            className="text-button"
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup ? "Sign in" : "Create an account"}
          </button>
        </p>
        <small className="hint">
          This beta does not yet offer email verification or password recovery.
          You can use email now; Google sign-in will be available when setup is
          complete.
        </small>
      </section>
    </main>
  );
}
