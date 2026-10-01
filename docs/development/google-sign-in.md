# Google sign-in setup

For current email errors, Google and Facebook setup, see [social sign-in](social-sign-in.md).

SmartClipper uses a server-side authorization-code flow with OpenID Connect, PKCE and verified ID tokens. The client secret stays in the API environment. Email works without a Google project.

1. Open your Google Cloud project's [Google Auth Platform clients](https://console.cloud.google.com/auth/clients). Configure the app name, support contact and audience. While the app is in testing, add the Google accounts that will test it.
2. Create an OAuth client with **Web application** as its type.
3. Register the local origins `http://localhost:5173` and `http://127.0.0.1:5173`. Register both exact authorized redirect URIs:
   - `http://localhost:5173/api/v1/auth/google/callback`
   - `http://127.0.0.1:5173/api/v1/auth/google/callback`
4. Put the client ID and client secret in the ignored repository `.env`:

   ~~~dotenv
   SMARTCLIPPER_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   SMARTCLIPPER_GOOGLE_CLIENT_SECRET=your-client-secret
   ~~~

   Also configure a persistent random `SMARTCLIPPER_SESSION_SECRET` of at least 32 characters. A persistent secret has been configured for the current local workspace; do not commit it. Restart the API after changing environment settings.
5. Open SmartClipper. The main page appears immediately. Import/generate/edit as a guest, then choose **Sign in to download**. **Continue with Google** becomes enabled when both credentials are present. Consent should return to the same project and move the guest's projects into the authenticated account.
6. Validate consent, cancellation, reload, sign-out, account collisions and workspace ownership with real test accounts. An existing email account requires its original sign-in method; the app does not merge accounts just because Google returns the same email.

For deployment, register the actual HTTPS origin/callback, configure allowed origins/hosts, public URL and secure cookies, and complete the provider's publishing requirements. Callback origins are selected only from the configured allowlist, keeping localhost and 127.0.0.1 cookies on their own hosts.

Google's [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) explains client credentials and exact redirect URI matching. Its [client setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) covers registering web origins. The current environment has no Google client credentials, so live Google consent remains pending.
