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

const oauthMessages: Record<string, string> = {
  account_exists:
    "An account with this email is already registered. Sign in using its original email/password or provider. Accounts are not linked automatically.",
  cancelled:
    "Social sign-in was cancelled. Please try again or continue with email.",
  expired:
    "Your sign-in session expired or could not be verified. Start social sign-in again from this page.",
  provider_email:
    "Your provider did not share a valid verified email. Allow email access or continue with email.",
  provider_response:
    "The sign-in provider returned an incomplete response. Please try again or continue with email.",
  provider_unavailable:
    "The sign-in provider is currently unavailable or rejected the app configuration. Please try again or continue with email.",
  not_configured:
    "This social sign-in option is not configured yet. Please continue with email.",
  retry: "Your account could not be saved. Please try signing in again.",
};

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
    oauthError
      ? oauthMessages[oauthError] ||
          "Social sign-in could not be completed. Please try again or continue with email."
      : "",
  );
  const [errorField, setErrorField] = useState("");
  const [providersReady, setProvidersReady] = useState(false);
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
    let active = true;
    api
      .providers()
      .then((value) => {
        if (active) setProviders(value);
      })
      .catch(() => {
        if (active)
          setError(
            "We couldn't reach the sign-in service. Please try again shortly.",
          );
      })
      .finally(() => {
        if (active) setProvidersReady(true);
      });
    return () => {
      active = false;
    };
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
              Multilingual shorts & English captions
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
          {(["google", "facebook"] as const).map((provider) => (
            <a
              key={provider}
              className={`secondary ${providers[provider] ? "" : "disabled"}`}
              href={
                providers[provider]
                  ? `/api/v1/auth/${provider}/start?return_to=${encodeURIComponent(returnPath)}`
                  : undefined
              }
              aria-disabled={!providers[provider]}
              tabIndex={providers[provider] ? 0 : -1}
              aria-describedby={
                !providers[provider] ? "social-setup-note" : undefined
              }
            >
              {provider === "google" ? "G" : "f"}
              <span>
                Continue with {provider === "google" ? "Google" : "Facebook"}
              </span>
              {!providers[provider] && (
                <small>{providersReady ? "Not configured" : "Checking…"}</small>
              )}
            </a>
          ))}
        </div>
        {providersReady && (!providers.google || !providers.facebook) && (
          <p id="social-setup-note" className="hint">
            Unavailable social options need app setup. You can create an account
            or sign in with email now.
          </p>
        )}
        <div className="divider">
          <span>or continue with email</span>
        </div>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setError("");
            setErrorField("");
            const invalid =
              signup && !name.trim()
                ? { field: "name", message: "Enter your name." }
                : !email.trim() ||
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
                  ? { field: "email", message: "Enter a valid email address." }
                  : !password
                    ? { field: "password", message: "Enter your password." }
                    : signup && password.length < 8
                      ? {
                          field: "password",
                          message:
                            "Password must be at least 8 characters long.",
                        }
                      : password.length > 128
                        ? {
                            field: "password",
                            message:
                              "Password must be no more than 128 characters long.",
                          }
                        : null;
            if (invalid) {
              setError(invalid.message);
              setErrorField(invalid.field);
              return;
            }
            setBusy(true);
            try {
              onLogin(
                await api.authenticate(
                  signup,
                  email.trim(),
                  password,
                  signup ? name.trim() : "Creator",
                ),
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : "Sign-in failed.");
              setErrorField(err instanceof api.ApiError ? err.field || "" : "");
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
                aria-invalid={errorField === "name" || undefined}
                aria-describedby={
                  errorField === "name" ? "auth-error" : undefined
                }
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
              aria-invalid={errorField === "email" || undefined}
              aria-describedby={
                errorField === "email" ? "auth-error" : undefined
              }
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
              aria-invalid={errorField === "password" || undefined}
              aria-describedby={
                errorField === "password"
                  ? "auth-error"
                  : signup
                    ? "password-help"
                    : undefined
              }
              minLength={signup ? 8 : 1}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {signup && (
              <small id="password-help">
                8–128 characters. Passwords are case-sensitive.
              </small>
            )}
          </label>
          {error && (
            <p id="auth-error" role="alert" className="alert">
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
            disabled={busy}
            onClick={() => {
              setSignup(!signup);
              setError("");
              setErrorField("");
            }}
          >
            {signup ? "Sign in" : "Create an account"}
          </button>
        </p>
        <small className="hint">
          This beta does not yet offer email verification or password recovery.
          Social sign-in creates an account on your first visit and signs you in
          on later visits, when the provider is configured.
        </small>
      </section>
    </main>
  );
}
