# Mission Control GCP Launch Checklist

Use this file as the short path to production. The repo already contains working Dockerfiles, Cloud Build configs, and a bootstrap script. The remaining work is mostly project setup, secrets, DNS, and a few known gaps.

## Already in place

- `mc-web` deployment path: Next.js app builds successfully in production mode with the root `Dockerfile`.
- `mc-api` deployment path: Express API builds successfully from `server/Dockerfile`.
- `mc-scraper` deployment path: Cloud Run Job config exists in `deploy/gcp/cloudbuild.scraper.yaml`.
- GCP bootstrap flow exists: `deploy/gcp/bootstrap.sh`.
- Health endpoints exist for smoke checks:
  - Web: `/api/healthz`
  - API: `/health/live`, `/health/startup`, `/health`
- Login is restricted to `@arrsys.com` in:
  - `auth.ts`
  - `lib/auth/hd-guard.ts`
  - `middleware.ts`

## Still needed before launch

### 1. GCP project and credentials

- Pick the production GCP project ID.
- Make sure billing is enabled.
- Authenticate locally:
  - `gcloud auth login`
  - `gcloud auth application-default login`
- Confirm you can deploy into the target project.

### 2. Secrets and runtime config

- Confirm Cloud SQL is the production data plane for both the app and API:
  - `mc-app-db-url` for Prisma/Next.js data
  - `mc-api-db-url` for the Express API data
- Decide which optional integrations are needed at launch:
  - `OPENROUTER_API_KEY`
  - `IMAGE_OPENROUTER_API_KEY`
  - `FIRECRAWL_API_KEY`
  - `SERPER_API_KEY`
  - `HUBSPOT_ACCESS_TOKEN`
  - `HUBSPOT_PORTAL_ID`
  - Google Sheets service-account credentials

### 3. OAuth for Arrsys users

- Create the Google OAuth Web client during bootstrap.
- After `mc-web` is deployed, add the exact redirect URI:
  - `https://<your-web-host>/api/auth/callback/google`
- Verify sign-in works only for `@arrsys.com`.

### 4. Custom domain: `support.arrsys.com`

- `bootstrap.sh` now prepares the load balancer + certificate-manager layer for `support.arrsys.com`, but it intentionally leaves `NEXTAUTH_URL` on the `run.app` hostname until the domain is live.
- Use `deploy/gcp/provision-edge.sh` to re-check the edge setup and DNS-authorization record any time.
- Recommended production direction: put `mc-web` behind a Google Cloud external Application Load Balancer and attach `support.arrsys.com` there.
- Update DNS at your registrar or Cloud DNS after the host is ready.
- Once the domain is live, run `deploy/gcp/activate-custom-domain.sh` to switch `NEXTAUTH_URL` to `https://support.arrsys.com`.

### 5. OpenClaw gateway dependency

- Some panels still depend on the external OpenClaw gateway.
- Until that gateway is hosted and `NEXT_PUBLIC_GATEWAY_URL` points to it, those panels can return `502`.
- Kanban, Org chart, Lead Gen, and Directory Scraper do not depend on that gateway.

## Local readiness findings

- Root Next.js production build: passes.
- `server` TypeScript build: passes.
- Automated Vitest suite: currently fails during `prisma db push` in `vitest.setup.ts` with a Prisma schema-engine error before tests run.
- There is no committed ESLint config yet, so `next lint` is not usable non-interactively.

## Launch order

1. Run `bash deploy/gcp/bootstrap.sh <PROJECT_ID> us-central1`
2. Verify with `bash deploy/gcp/verify-deployment.sh <PROJECT_ID> us-central1`
3. Confirm Google sign-in works on the `run.app` URL
4. Map `support.arrsys.com`
5. Run `bash deploy/gcp/activate-custom-domain.sh <PROJECT_ID> us-central1 support.arrsys.com`
6. Point reps to the custom domain only after auth and smoke checks pass
