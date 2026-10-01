# Authentication and import-button acceptance

## Changes

The two paste-link actions now have a lavender background, border, shadow and keyboard focus outline. Email authentication exposes specific error codes/messages and field association. Both social options are visible, with honest configuration status. Callbacks preserve the existing state/signature checks and handle provider failures and identity-save conflicts.

## Manual verification

34 manual HTTP/callback checks passed using a separate SQLite database under ignored `.cache`; no user account or video was changed by those checks.

- Successful email signup, persisted session, logout, repeat login and guest-project ownership transfer on signup/login.
- Normalized duplicate email (409), incorrect password (401), unknown email (401), missing/short/overlong password (422), invalid email (422) and social-only account guidance (401).
- Missing guest CSRF rejected (403); validation on unrelated endpoints retains its existing response shape.
- Controlled Google callback creates an account and signs back into the same identity; guest work transfers. Authlib's actual RSA JWT, nonce, audience and state validation ran against locally generated provider responses. Replay, incorrect state, incorrect nonce, wrong audience, unverified email, cancellation and email collision produced the intended failures.
- Controlled Facebook callback creates an account and signs back into the same identity; guest work transfers. Real state validation rejects replay. Missing email, profile network failure and authorization-start network failure return the intended error.
- Missing provider credentials report both providers disabled, with explicit 503 configuration errors on their endpoints. These checks do not use fake credentials in the running app.
- Chrome on the real app shows the highlighted paste-link buttons, both social options, invalid-email and incorrect-password errors. Existing recent videos remain visible. No successful browser sign-in was performed into a review account, so the owner's guest workspace remains intact.

Production TypeScript/build, frontend formatting, Ruff and whitespace checks passed. JavaScript output is approximately 95.88 KB gzip. Existing unit suites and automatic CI remain skipped under the owner's current instruction; no unit suite pass is claimed.

## Remaining provider setup

No real Google or Facebook client credentials were configured in the local API. Live consent, real-provider first signup and real-provider repeat login cannot be verified until the owner supplies their app registrations. See [social sign-in setup](social-sign-in.md). This is a concrete configuration dependency, not a claim that live authentication has passed.
