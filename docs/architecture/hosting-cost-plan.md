# Hosting and cost plan

Research date: **2026-10-02**. This is a proposal; no domain, infrastructure or billing account has been purchased. Prices and estimates exclude taxes unless the provider says otherwise. USD and EUR are kept separate.

## 1. Start with a small private beta

Use a Linux CPU server for the API and bounded FFmpeg workers, a PostgreSQL container with off-server backups, and HTTPS through Caddy. A managed database can be priced separately when the budget grows. Serve React from the same origin as `/api` to simplify cookies, CSRF and OAuth callbacks. Do not place long-running FFmpeg/transcription work in a request handler or a static hosting function.

Keep the current local database queue for development. Before public hosted concurrency, implement the Celery/Redis worker approach in the accepted web architecture, including worker leases, idempotent retries and recovery after worker death. Start with one worker machine and limit concurrent renders to its measured CPU/RAM capacity.

**Planning budget: €30–60/month for a small CPU beta**, plus optional GPU processing and variable object storage. This is an allowance rather than a promise of throughput or a provider quote. User minutes, average resolution, retention and transcription mode determine the real bill.

| Item                   | Current reference / estimate                                    | Choice                                                                                              |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| CPU server             | Hetzner CX43 €15.99/month; CX53 €29.49/month, excluding IPv4    | Benchmark RAM and concurrent native jobs before choosing; capacity is not guaranteed by price alone |
| Backups and monitoring | Allow €5–15/month initially                                     | Database backup off the worker, restore check and billing alerts                                    |
| Domain                 | Allow €15–25/year; exact registration and renewal depend on TLD | Choose a name after availability and trademark checks                                               |
| Static frontend        | Can share the server; Cloudflare static assets are also free    | Same origin first; CDN later if measured useful                                                     |
| Private video storage  | R2 Standard $0.015/GB-month after 10 GB-month free              | Short retention and direct multipart uploads                                                        |

The CPU prices above reflect Hetzner's June 2026 adjustments, not older advertised figures. See [Hetzner's price table](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/). Confirm the selected region, specifications, tax treatment, IPv4 and checkout total before provisioning.

Cloudflare bills R2 operations separately and charges no egress. At the monthly average of 100 GB-month stored, storage alone is approximately **$1.35/month** after its allowance; 500 GB-month is approximately **$7.35**. These examples do not mean 500 GB of monthly uploads: retained originals, proxies, thumbnails and exports all consume storage. Consult [R2 pricing](https://developers.cloudflare.com/r2/pricing/) and [static asset pricing](https://developers.cloudflare.com/workers/platform/pricing/).

## 2. Reduce processing cost before adding hardware

1. Measure upload time, transcript time, first playable short, all shorts ready, render seconds and peak RAM per job.
2. Reuse each owner's transcript and source proxy when the source revision, language and transcription profile match. Keep the transcription model warm in the worker.
3. Generate the first complete preview immediately, then bound parallel rendering. Do not lower quality gates for early output.
4. Export full-resolution files only when requested, and reuse an unchanged export revision. Avoid re-rendering while a user drags a slider.
5. Set per-account minute quotas, simultaneous-job limits, daily compute caps and storage limits before inviting anonymous traffic. Apply server-side accounting rather than trusting the browser.
6. Propose seven-day original/proxy retention and thirty-day exported-clip retention for beta, with clear product messaging and user deletion. Implement and approve the policy before deleting any existing videos. Retain active jobs and do not delete a source needed for further edits.
7. Track billable processing minutes and storage separately; alert at 50%, 80% and 100% of the chosen monthly allowance.

## 3. Add on-demand GPU transcription when measurements justify it

Avoid a continuously running GPU for sparse beta traffic. Runpod currently lists a Secure Cloud RTX 4090 Pod at **$0.74/hour**; its serverless RTX 4090 listing is **$1.10/hour**. Twenty active Pod hours are $14.80 compute-only; 730 idle/active hours would be $540.20. These are different deployment products and exclude additional storage, startup overhead and other billable resources. See [Runpod pricing](https://www.runpod.io/pricing/).

Benchmark a real cold start, warm transcription and teardown. Choose a region and data handling policy before sending customer media to another provider. Autoscaling and teardown are not yet implemented in this repository. Faster transcription alone does not remove upload and rendering time.

## 4. Public hosting prerequisites

- Direct browser-to-private-object-storage **resumable multipart uploads** for the 3 GB limit. Authorize each upload against the owner, finalize server-side, probe the actual video, and clean abandoned parts. Keep signed URLs short lived. The current local API upload implementation is not a production object-storage integration.
- Avoid sending a full multi-gigabyte upload through an ordinary CDN proxy. Its [connection limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/) are independent of our application's configured limit. Follow [R2 upload guidance](https://developers.cloudflare.com/r2/objects/upload-objects/).
- PostgreSQL migrations, backup restore, queue recovery, hard resource limits, disk-watermark admission controls, request rate limits and monitoring.
- Run native media processing in an isolated worker without unnecessary network access or host privileges. Keep SSRF protections for social links and owner checks for files and exports.
- Persistent secrets, production HTTPS cookies, exact allowed origins/hosts, and real Google/Meta consent checks on the selected domain. Configure provider test users/review requirements before opening registration.
- A privacy policy, deletion/retention controls and cost quotas visible to users. Do not market unfinished social publishing or licensed trend-song discovery as working.

## 5. Domain and rollout milestones

Candidates to investigate: **getclivvy.com**, **useclivvy.com**, **clivvy.app**. Availability and trademark clearance have not been verified. Compare the renewal price, not just the first-year discount. [Cloudflare Registrar](https://developers.cloudflare.com/registrar/) offers registration and renewal at registry cost; the exact TLD cost must be checked at checkout.

1. Owner selects budget, region and domain; benchmark representative five-, thirty- and ninety-minute videos separately from the current local duration cap.
2. Implement storage uploads, migrations, queue recovery, quotas and retention. Verify auth with real provider test accounts.
3. Deploy a private beta on one HTTPS origin. Register `https://<chosen-domain>/api/v1/auth/google/callback` and the equivalent Facebook callback.
4. Measure first-result latency and cost per source minute for a week. Scale or add GPU only when measurements justify the added bill.
5. Open a limited public beta after restore, deletion and abuse checks. Social publishing is a later milestone.
