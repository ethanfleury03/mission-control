# Mission Control Production Runbook

Use this runbook to launch Mission Control for reps on `support.arrsys.com`.

## 1. Core deploy

Run the full bootstrap first. This deploys `mc-web`, `mc-api`, `mc-scraper`, Cloud SQL, secrets, and the scheduler, then prepares the custom-domain edge.

```bash
bash deploy/gcp/bootstrap.sh YOUR_PROJECT_ID us-central1 support.arrsys.com
```

What to confirm right away:

- `mc-web` `run.app` URL responds on `/api/healthz`
- `mc-api` rejects unauthenticated `/health/live` requests
- Google OAuth client contains both callback URIs:
  - `https://<mc-web-run-app>/api/auth/callback/google`
  - `https://support.arrsys.com/api/auth/callback/google`

## 2. Edge and DNS

Bootstrap calls `deploy/gcp/provision-edge.sh`, which prepares:

- global static IP
- serverless NEG for `mc-web`
- global external Application Load Balancer
- HTTP to HTTPS redirect
- Certificate Manager DNS authorization
- managed certificate for `support.arrsys.com`

Before cutover:

1. Add the DNS authorization record printed by `provision-edge.sh`
2. Wait for the certificate state to become `ACTIVE`
3. Lower the `support.arrsys.com` TTL to `300`
4. Record the current DNS target as the rollback target
5. Point `support.arrsys.com` to the printed load-balancer IP

Use this to re-check readiness at any time:

```bash
bash deploy/gcp/verify-deployment.sh YOUR_PROJECT_ID us-central1 support.arrsys.com
```

## 3. Activate the custom domain

After public DNS for `support.arrsys.com` resolves to the new edge and `/api/healthz` is healthy:

```bash
bash deploy/gcp/activate-custom-domain.sh YOUR_PROJECT_ID us-central1 support.arrsys.com
```

This does three things:

- verifies the custom-domain health check
- updates `NEXTAUTH_URL` to `https://support.arrsys.com`
- provisions uptime + alerting policies

## 4. UAT for rep launch

Required launch-scope checks:

- Kanban loads and can create/update work items
- Directory Scraper can create a job and show status
- Lead Generation can load markets/accounts and import from scraper results
- `https://support.arrsys.com/api/healthz` returns `200`
- `@arrsys.com` Google accounts can sign in
- non-`@arrsys.com` Google accounts are rejected
- Blogs is hidden in the sidebar and blog API routes return `404`

Build checks:

```bash
npm run build
npm --prefix server run build
```

## 5. Monitoring and logs

`deploy/gcp/provision-monitoring.sh` creates:

- an uptime check for `https://support.arrsys.com/api/healthz`
- an alert for repeated `mc-web` 5xx responses
- an alert for unhealthy `mc-api` instances

If you want notifications, set `MISSION_CONTROL_NOTIFICATION_CHANNELS` to a comma-separated list of Monitoring notification channel resource names before running the monitoring script.

Useful console entry points:

- Cloud Run services: `https://console.cloud.google.com/run?project=YOUR_PROJECT_ID`
- Load balancers: `https://console.cloud.google.com/net-services/loadbalancing/list/loadBalancers?project=YOUR_PROJECT_ID`
- Certificate Manager: `https://console.cloud.google.com/security/ccm/list/certificates?project=YOUR_PROJECT_ID`
- Monitoring: `https://console.cloud.google.com/monitoring?project=YOUR_PROJECT_ID`

## 6. Rollback

Rollback order:

1. Restore the old DNS record for `support.arrsys.com`
2. Confirm the previous site is reachable again
3. Set `NEXTAUTH_URL` on `mc-web` back to the `run.app` URL if the custom domain will stay offline
4. Leave the new `run.app` deployment running for debugging

Rollback command for `NEXTAUTH_URL`:

```bash
gcloud run services update mc-web \
  --project YOUR_PROJECT_ID \
  --region us-central1 \
  --update-env-vars NEXTAUTH_URL=https://YOUR_MC_WEB_RUN_APP_URL
```
