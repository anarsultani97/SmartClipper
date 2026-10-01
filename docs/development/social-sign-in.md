# Clivvy email and social sign-in

The main workspace remains available to guests. Email signup and login work without social credentials. Both Google and Facebook use server-side authorization-code callbacks, the same flow for first-time account creation and subsequent sign-in. Secrets stay in the ignored `.env` file.

## 1. Email behavior

- Signup passwords must contain 8–128 characters. Login accepts the existing password without changing it. Passwords are case-sensitive and never trimmed.
- Duplicate registration: **An account with this email is already registered. Please sign in instead.** (409, `email_registered`).
- Wrong password: **Incorrect password. Please try again.** (401, `incorrect_password`).
- Unknown email: **No account is registered with this email. Create an account first.** (401, `email_not_registered`).
- A social-only account directs the user to its registered provider rather than suggesting a password can work (401, `provider_account`).
- Invalid email, missing/short/long password and invalid name return field-specific 422 errors. The form uses the same language and marks the relevant field.
- The frontend refreshes the current session's CSRF token before authentication, including when another tab changes the cookie. Successful authentication rotates the session and claims only the authenticated guest's projects.
- Password hashing, rate limiting, CSRF and allowed-origin protections remain active. Detailed account-existence messages are intentional, as requested by the owner. Email verification/password recovery remain separate unfinished features.

## 2. Google registration

1. Follow [Google's web-server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server). Create a **Web application** OAuth client in the owner's Google Cloud project; configure the consent audience and test users when needed.
2. Register the exact callbacks used locally:
   - `http://localhost:5173/api/v1/auth/google/callback`
   - `http://127.0.0.1:5173/api/v1/auth/google/callback`
3. Configure `.env`: `SMARTCLIPPER_GOOGLE_CLIENT_ID` and `SMARTCLIPPER_GOOGLE_CLIENT_SECRET`. The client ID must belong to this web application.
4. Keep a persistent random `SMARTCLIPPER_SESSION_SECRET` of at least 32 characters. Changing this secret or restarting with a generated temporary secret invalidates in-progress OAuth sessions.
5. Restart the API and confirm `/api/v1/auth/providers` reports `google: true`. The Google button becomes enabled. A verified Google email is required; Authlib validates state, nonce, issuer, audience and ID-token signature, with PKCE.

## 3. Facebook registration

1. In the owner's [Meta app dashboard](https://developers.facebook.com/apps/), configure the appropriate Facebook Login use case for the app. Follow the [web guide](https://developers.facebook.com/docs/facebook-login/web/) and [manual authorization-code flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/).
2. Enable web login and register the exact `/api/v1/auth/facebook/callback` URI on the actual approved app origin. For local review, configure the supported local development callback in that app's dashboard; do not assume a plain HTTP callback is accepted by every Meta app configuration. Prefer the registered HTTPS development origin where required.
3. Request `email` and `public_profile`. Check the app's test-user/role restrictions and the permissions/publishing requirements shown in its dashboard. Missing email permission is displayed as a specific sign-in failure.
4. Configure `.env`: `SMARTCLIPPER_FACEBOOK_CLIENT_ID` (Meta app ID), `SMARTCLIPPER_FACEBOOK_CLIENT_SECRET`, and `SMARTCLIPPER_FACEBOOK_API_VERSION` (the `vXX.X` version actually supported by that app). No version is guessed by this code.
5. Restart the API and confirm the providers endpoint reports `facebook: true`. The Facebook button becomes enabled.

## 4. Origin and account checks

- Register both local hostnames if both will be used: browser cookies are separate for `localhost` and `127.0.0.1`. Use one hostname throughout a sign-in attempt.
- For HTTPS hosting, set `SMARTCLIPPER_PUBLIC_URL`, allowed origins/hosts, persistent session secret and `SMARTCLIPPER_SECURE_COOKIES=true`. The callback must match the provider registration exactly, including its path.
- Verify real consent, cancellation, first-time creation, repeat sign-in, reload and guest-video preservation with the owner's provider test accounts. Missing credentials are honestly displayed as **Not configured**; fake credentials do not enable real consent.
- Different login methods never silently merge accounts by a matching email. If the email already belongs to another account, use its original method. Explicit identity linking is a future authenticated-account feature.
- Provider network failures, invalid responses, invalid state/signatures and database identity conflicts return a readable sign-in error instead of a server traceback. Raw tokens and provider error details are not shown to users.

## Current local verification boundary

Provider registration credentials were absent when this fix began. Local email and controlled OAuth callback verification are recorded in `auth-fix-acceptance.md`; successful real Google/Facebook consent requires the owner's registrations and secrets. This document does not claim that live provider consent has passed.
