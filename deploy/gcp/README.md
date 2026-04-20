# Mission Control on GCP

End-to-end deployment of Mission Control to Google Cloud Platform: two Cloud Run services (Next.js dashboard + Express API), one Cloud Run Job (Playwright directory scraper), Cloud SQL for Postgres, Secret Manager, Cloud Scheduler, and a Google-OAuth login restricted to `@arrsys.com`.

## What you get

| Workload           | Runtime                        | Data                                    | Public? |
| ------------------ | ------------------------------ | --------------------------------------- | ------- |
| `mc-web`           | Cloud Run service (Next.js)    | Turso (dashboard) + proxy to `mc-api`   | Yes, but only `@arrsys.com` Google accounts can authenticate |
| `mc-api`           | Cloud Run service (Express)    | Cloud SQL Postgres via unix socket      | **No** — IAM-private; only `mc-web` can invoke |
| `mc-scraper`       | Cloud Run Job (Playwright)     | Turso                                   | Invoked every 5 min by Cloud Scheduler |

Auth chain:

```
Browser --(Google OAuth, hd=arrsys.com)--> mc-web
                                              |
                                              +--(Google ID token via metadata server)--> mc-api (private)
```

## Prerequisites

- `gcloud` CLI authenticated as a user with Owner/Editor on the empty target project.
- **Application Default Credentials** for the Cloud SQL proxy (schema step). After `gcloud auth login`, run once: `gcloud auth application-default login` (same machine / workspace as bootstrap).
- **Billing** enabled on the project (required for Cloud Storage, Cloud Build uploads, etc.). Bootstrap uses the **global** Cloud Build API (`gcloud builds submit` **without** `--region`). The bucket **`gs://PROJECT_ID_cloudbuild` must be in multi-region `US`**. **Cloud Build runs as a user-managed service account** `mc-build-runner@PROJECT_ID.iam.gserviceaccount.com` (created by bootstrap) with **`logging: CLOUD_LOGGING_ONLY`**, because many orgs **block** Google’s default **`@cloudbuild.gserviceaccount.com`** and **Compute default** SAs — without a custom worker, **`builds.create` returns NOT_FOUND** after upload. Bootstrap grants that SA logging, Artifact Registry, Cloud Run deploy, Cloud SQL client, Secret Manager access, and grants the **Cloud Build service agent** `roles/iam.serviceAccountTokenCreator` on it.
- `openssl` and `psql`. The bootstrap script installs the **Cloud SQL proxy** on demand; on **Debian/Ubuntu** it also tries `apt-get install postgresql-client` if `psql` is missing (no `sudo` needed if you run as root). On **macOS**, install manually: `brew install libpq && brew link --force libpq`.
- For the schema step, the proxy uses **Application Default Credentials**. If the proxy log says permission denied or invalid credentials, run: `gcloud auth application-default login` (in the same environment where you run bootstrap).
- A Turso database + auth token (free tier is fine). The dashboard continues to use Turso; only the Express API uses Cloud SQL.
- Roughly 15 minutes (mostly the Cloud SQL instance creation — 5 minutes — and the three container builds).

## One-shot deploy

Put `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the **repo root** `.env` file, or export them in the shell. The bootstrap script **automatically sources** `$REPO_ROOT/.env` if it exists (bash never reads `.env` on its own). The loader strips carriage returns, so **Windows CRLF** `.env` files work.

If you still see `$'\r': command not found` when sourcing `.env` manually, convert to Unix line endings once: `sed -i 's/\r$//' .env` (GNU sed) or open the file in your editor and save with **LF** line endings.

```bash
# 1. Authenticate and pick the project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2a. Either: put Turso vars in ./.env (recommended), or 2b. export them:
export TURSO_DATABASE_URL="libsql://..."
export TURSO_AUTH_TOKEN="..."

# Optional — wired into mc-web / mc-scraper only if set
export OPENROUTER_API_KEY="..."     # directory scraper AI
export FIRECRAWL_API_KEY="..."      # directory scraper alt fetch
export SERPER_API_KEY="..."         # company website discovery
export HUBSPOT_ACCESS_TOKEN="..."   # lead-gen HubSpot push
export HUBSPOT_PORTAL_ID="..."
export GOOGLE_SERVICE_ACCOUNT_EMAIL="..."         # Google Sheets export
export GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="..."

# 3. Run the bootstrap
bash deploy/gcp/bootstrap.sh YOUR_PROJECT_ID us-central1
```

During the run you will be prompted **once** to create an OAuth 2.0 client in the console (Google doesn't expose Web OAuth client creation via `gcloud` for Workspace Internal apps). The script walks you through it, waits for the Client ID/Secret, stores them in Secret Manager, and continues.

At the end the script prints:

- The public `mc-web` URL (your dashboard).
- The private `mc-api` URL.
- A confirmation that `/healthz` responds publicly and `mc-api` refuses unauthenticated requests.

### After deploy: verify and OAuth redirect

With `gcloud` authenticated to the same project:

```bash
bash deploy/gcp/verify-deployment.sh YOUR_PROJECT_ID us-central1
```

That prints **`mc-web`** / **`mc-api`** URLs, **`/healthz`** and **`/health/live`** HTTP codes, and the **exact OAuth redirect URI** to paste into the Google OAuth Web client (APIs & Services → Credentials).

## What the bootstrap does (summary)

1. Enables: Run, Cloud Build, Artifact Registry, Cloud SQL Admin, Secret Manager, Cloud Scheduler, IAM, IAM Credentials, Compute.
2. Creates Artifact Registry repo `mission-control` in the chosen region.
3. Creates Cloud SQL Postgres instance `mc-sql` (db-f1-micro, zonal), database `missioncontrol`, user `mcapp` with a generated password stored in Secret Manager.
4. Creates service accounts: `mc-web-sa`, `mc-api-sa`, `mc-scraper-sa`, `mc-scheduler-sa`.
5. Writes all secrets to Secret Manager: `mc-api-db-url`, `mc-auth-secret`, `mc-google-client-id`, `mc-google-client-secret`, `mc-turso-url`, `mc-turso-token`, plus any optional ones you exported.
6. Binds `roles/secretmanager.secretAccessor` on the relevant secrets and `roles/cloudsql.client` on `mc-api-sa`.
7. Applies `server/src/db/migrations/*.sql` to Cloud SQL via `apply-pg-schema.sh` (idempotent tracker table).
8. Builds + deploys `mc-api` first, reads its URL, then builds + deploys `mc-web` with `API_URL` / `NEXT_PUBLIC_API_URL` wired in. Adds `run.invoker` binding so `mc-web-sa` can call the private API.
9. Builds + deploys the `mc-scraper` Cloud Run Job.
10. Creates/updates a Cloud Scheduler HTTP trigger `mc-scraper-tick` that runs the Job every 5 minutes with an OIDC token.
11. Asks you to add the OAuth redirect URI (`<mc-web-url>/api/auth/callback/google`) to the OAuth client (10 seconds in the console).
12. Runs a smoke test.

## Auth details

- NextAuth v5 (`auth.ts`) with Google provider, `session.strategy = 'jwt'`.
- `signIn()` callback only returns `true` when **both** of the following hold:
  - `profile.email_verified === true`, and
  - `profile.hd === 'arrsys.com'`, and
  - `profile.email` ends in `@arrsys.com`.
- `middleware.ts` rejects unauthenticated requests for every path except `/signin`, `/healthz`, `/api/auth/*`, and static assets.
- `app/api/_lib/backend.ts` fetches a Google-signed ID token from the Cloud Run metadata server for any outbound request to a `*.run.app` host and sets it as `Authorization: Bearer ...`. Locally this no-ops so `npm run dev` still works.
- `mc-api` is deployed with `--no-allow-unauthenticated`. Even someone with the API URL cannot hit it.

`mc-api` listens on `PORT` **before** Postgres finishes connecting. **Cloud Run startup probe** hits `GET /health/live` (always 200 once HTTP is up). **`GET /health/startup`** returns 503 until migrations and seeds finish, then 200. **`GET /health`** returns 503 with `database: "initializing"` until the API is fully ready, then behaves as before (DB ping). Other routes return 503 with `error: "starting"` until ready so callers do not hit half-initialized state.

## Re-deploying a single service

```bash
# mc-web only (after UI/code changes):
gcloud builds submit . \
  --region=us-central1 \
  --config=deploy/gcp/cloudbuild.web.yaml \
  --substitutions=_REGION=us-central1,_API_URL=$(gcloud run services describe mc-api --region=us-central1 --format='value(status.url)')

# mc-api only:
gcloud builds submit . \
  --region=us-central1 \
  --config=deploy/gcp/cloudbuild.api.yaml \
  --substitutions=_REGION=us-central1,_CLOUD_SQL_INSTANCE=PROJECT:us-central1:mc-sql

# mc-scraper only:
gcloud builds submit . --region=us-central1 --config=deploy/gcp/cloudbuild.scraper.yaml
```

## Rollback

Cloud Run keeps every revision. To roll back:

```bash
gcloud run services update-traffic mc-web --region=us-central1 --to-revisions=mc-web-00002-abc=100
```

For the scraper Job, list previous executions and re-run a known-good revision:

```bash
gcloud run jobs executions list --job=mc-scraper --region=us-central1
gcloud run jobs update mc-scraper --region=us-central1 --image=<previous-image-tag>
```

## Cost shape (order of magnitude)

- Cloud Run services scale to zero; expect a few dollars a month for the mc-web baseline plus traffic.
- Cloud SQL db-f1-micro: roughly $9/mo plus storage.
- Turso free tier covers the dashboard DB until you outgrow it.
- Cloud Scheduler: 3 free jobs, `mc-scraper-tick` is one of them.
- Artifact Registry storage: pennies per month.

## Gotchas

- The `.env.example` references an OpenClaw gateway on `localhost:18792` for the Agents / Registry panels. That service is not in this repo. After deploy those panels will return 502 until the gateway is hosted elsewhere and `NEXT_PUBLIC_GATEWAY_URL` is updated. Kanban, Org chart, Lead Gen, and the Directory Scraper work without it.
- First scraper run on a fresh Cloud Run Job has a ~20s cold start for Playwright. The `--task-timeout 900s` gives each tick up to 15 minutes of work.
- Prisma/Next still use Turso (SQLite) at runtime. If you later want a single GCP-only data plane, switch `prisma/schema.prisma` to `provider = "postgresql"`, generate a migration, and point the same Cloud SQL instance (separate DB) from `lib/prisma.ts`. Out of scope for this deploy.
