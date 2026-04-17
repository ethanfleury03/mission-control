#!/usr/bin/env bash
# Mission Control — end-to-end GCP bootstrap.
#
# Usage:
#   bash deploy/gcp/bootstrap.sh <PROJECT_ID> [REGION]
#
# Required env (Turso stays as the dashboard DB per plan):
#   TURSO_DATABASE_URL
#   TURSO_AUTH_TOKEN
#
# If these are only in the repo-root .env (not exported in the shell), the
# script loads .env automatically before checking.
#
# Optional env (any you skip simply don't get wired to Cloud Run):
#   OPENROUTER_API_KEY, FIRECRAWL_API_KEY, SERPER_API_KEY,
#   HUBSPOT_ACCESS_TOKEN, HUBSPOT_PORTAL_ID,
#   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
#   MISSION_CONTROL_WEBHOOK_URL, MISSION_CONTROL_WEBHOOK_SECRET
#
# Idempotent: re-runs reuse existing resources.

set -euo pipefail

PROJECT_ID="${1:?PROJECT_ID required (e.g. bash bootstrap.sh my-project us-central1)}"
REGION="${2:-us-central1}"

AR_REPO="mission-control"
SQL_INSTANCE="mc-sql"
SQL_DATABASE="missioncontrol"
SQL_USER="mcapp"
WEB_SA="mc-web-sa"
API_SA="mc-api-sa"
SCRAPER_SA="mc-scraper-sa"
SCHEDULER_SA="mc-scheduler-sa"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

info()   { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn()   { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()    { printf '\033[1;31mFATAL:\033[0m %s\n' "$*" >&2; exit 1; }
pause()  { read -r -p "$(printf '\033[1;35m?>\033[0m %s ' "$*")" _; }

# Load repo-root .env — bash does not read .env by itself; `source` exports vars
# for this script only (set -a = auto-export every assignment while sourcing).
# Strip CR (\r) so Windows-style CRLF files work (otherwise bash sees `$'\r'`
# as a stray command and variables never set correctly).
if [[ -f "$REPO_ROOT/.env" ]]; then
  info "Loading variables from $REPO_ROOT/.env"
  set -a
  # shellcheck disable=SC1090
  source <(tr -d '\r' < "$REPO_ROOT/.env")
  set +a
fi

command -v gcloud >/dev/null 2>&1 || die "gcloud not installed. See https://cloud.google.com/sdk/docs/install"
command -v openssl >/dev/null 2>&1 || die "openssl required"

info "Using project: $PROJECT_ID in region $REGION"
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud config set run/region "$REGION" >/dev/null
# Cloud Run / Artifact Registry are regional. Cloud Build submit must use the
# *global* API (no --region on gcloud builds submit). Regional
# .../locations/us-central1/builds returns 404 NOT_FOUND on many new projects
# until Google provisions workers there — do not depend on it for bootstrap.
gcloud config unset builds/region >/dev/null 2>&1 || true

[ -n "${TURSO_DATABASE_URL:-}" ] || die "TURSO_DATABASE_URL not set in env"
[ -n "${TURSO_AUTH_TOKEN:-}" ]   || die "TURSO_AUTH_TOKEN not set in env"

# Cloud SQL Auth Proxy (used by apply-pg-schema.sh) needs Application Default Credentials,
# not only 'gcloud auth login'. Fail fast with a clear message.
ensure_application_default_credentials() {
  if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" && -f "${GOOGLE_APPLICATION_CREDENTIALS}" ]]; then
    return 0
  fi
  if gcloud auth application-default print-access-token >/dev/null 2>&1; then
    return 0
  fi
  die "Application Default Credentials (ADC) are missing. The Cloud SQL proxy needs them for the schema step.

Run this once in this terminal (browser login), then re-run bootstrap:
  gcloud auth application-default login

This is separate from: gcloud auth login
Docs: https://cloud.google.com/docs/authentication/external/set-up-adc"
}
ensure_application_default_credentials

# -------------------------------------------------------------------------------------------------
# 1. Enable APIs
# -------------------------------------------------------------------------------------------------
info "Enabling required GCP APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  logging.googleapis.com \
  serviceusage.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  compute.googleapis.com

# Compute Engine API creates the default SA some orgs use for Cloud Build when @cloudbuild is delayed.
gcloud services enable compute.googleapis.com --project="$PROJECT_ID" >/dev/null 2>&1 || true

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
# Some orgs use the Compute Engine default SA for Cloud Build workers instead of @cloudbuild.gserviceaccount.com.
COMPUTE_DEFAULT_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
# Google-managed agent used by the Cloud Build API (distinct from @cloudbuild.gserviceaccount.com).
CLOUDBUILD_AGENT_SA="service-${PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com"

# Ensure the Cloud Build service identity exists (first-time project setup).
gcloud beta services identity create --service=cloudbuild.googleapis.com --project="$PROJECT_ID" >/dev/null 2>&1 || true
info "Ensuring Cloud Build service agent has roles/cloudbuild.serviceAgent on project"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_AGENT_SA}" \
  --role=roles/cloudbuild.serviceAgent --condition=None >/dev/null 2>&1 || true

# Global Cloud Build uses gs://PROJECT_ID_cloudbuild — that bucket MUST be in the
# **US** multi-region (same as Google's auto-created default). A regional bucket
# (e.g. us-central1) causes NOT_FOUND after source upload when the API resolves
# the default log / worker paths.
CLOUDBUILD_BUCKET="${PROJECT_ID}_cloudbuild"
GCS_SOURCE_STAGING="gs://${CLOUDBUILD_BUCKET}/source"
info "Ensuring Cloud Build bucket gs://${CLOUDBUILD_BUCKET} (location=US, global Cloud Build)"
if gcloud storage buckets describe "gs://${CLOUDBUILD_BUCKET}" --project="$PROJECT_ID" >/dev/null 2>&1; then
  EXISTING_LOC="$(gcloud storage buckets describe "gs://${CLOUDBUILD_BUCKET}" --format='value(location)' 2>/dev/null || true)"
  if [[ -n "$EXISTING_LOC" && "$EXISTING_LOC" != "US" ]]; then
    die "Bucket gs://${CLOUDBUILD_BUCKET} exists in region '${EXISTING_LOC}' but global Cloud Build requires multi-region **US**.

Delete the bucket in Cloud Console (Storage) after emptying it, then re-run bootstrap:
  https://console.cloud.google.com/storage/browser/${CLOUDBUILD_BUCKET}?project=${PROJECT_ID}

Or: gcloud storage rm --recursive gs://${CLOUDBUILD_BUCKET}/ --project=${PROJECT_ID}
"
  fi
else
  gcloud storage buckets create "gs://${CLOUDBUILD_BUCKET}" \
    --project="$PROJECT_ID" \
    --location=US \
    --uniform-bucket-level-access
fi
# Cloud Build needs buckets.get + object read/write on staging. objectAdmin alone can miss
# bucket metadata APIs and yields NOT_FOUND after upload. Use storage.admin scoped to this bucket only.
grant_staging_bucket_access() {
  local MEMBER="$1"
  gcloud storage buckets add-iam-policy-binding "gs://${CLOUDBUILD_BUCKET}" \
    --member="$MEMBER" \
    --role=roles/storage.admin >/dev/null 2>&1 || true
}
grant_staging_bucket_access "serviceAccount:${CLOUDBUILD_AGENT_SA}"
if gcloud iam service-accounts describe "${CLOUDBUILD_SA}" --project="$PROJECT_ID" >/dev/null 2>&1; then
  grant_staging_bucket_access "serviceAccount:${CLOUDBUILD_SA}"
elif gcloud iam service-accounts describe "${COMPUTE_DEFAULT_SA}" --project="$PROJECT_ID" >/dev/null 2>&1; then
  warn "Granting staging bucket to Compute default SA (legacy @cloudbuild not provisioned yet): ${COMPUTE_DEFAULT_SA}"
  grant_staging_bucket_access "serviceAccount:${COMPUTE_DEFAULT_SA}"
fi
SUBMITTER_ACCOUNT="$(gcloud config get-value account 2>/dev/null || true)"
if [[ -n "$SUBMITTER_ACCOUNT" && "$SUBMITTER_ACCOUNT" != "(unset)" ]]; then
  if [[ "$SUBMITTER_ACCOUNT" == *.iam.gserviceaccount.com ]]; then
    grant_staging_bucket_access "serviceAccount:${SUBMITTER_ACCOUNT}"
  else
    grant_staging_bucket_access "user:${SUBMITTER_ACCOUNT}"
  fi
fi

# Legacy Cloud Build SA can take minutes to appear after enabling the API; do not hard-fail.
info "Waiting for Cloud Build service account (up to ~3 minutes)…"
for _ in $(seq 1 36); do
  if gcloud iam service-accounts describe "${CLOUDBUILD_SA}" --project="$PROJECT_ID" >/dev/null 2>&1; then
    info "Cloud Build SA ready: ${CLOUDBUILD_SA}"
    grant_staging_bucket_access "serviceAccount:${CLOUDBUILD_SA}"
    break
  fi
  sleep 5
done
if ! gcloud iam service-accounts describe "${CLOUDBUILD_SA}" --project="$PROJECT_ID" >/dev/null 2>&1; then
  warn "Legacy Cloud Build SA still missing: ${CLOUDBUILD_SA}"
  warn "Granted staging bucket access to ${COMPUTE_DEFAULT_SA} (common fallback). If builds still fail with NOT_FOUND,"
  warn "enable the Compute Engine API once: gcloud services enable compute.googleapis.com --project=${PROJECT_ID}"
  warn "Or ask an org admin to restore the Cloud Build service account in IAM."
fi

# -------------------------------------------------------------------------------------------------
# 2. Artifact Registry
# -------------------------------------------------------------------------------------------------
info "Ensuring Artifact Registry repo '$AR_REPO'"
if ! gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker --location="$REGION" \
    --description="Mission Control container images"
fi

# -------------------------------------------------------------------------------------------------
# 3. Cloud SQL for Postgres
# -------------------------------------------------------------------------------------------------
info "Ensuring Cloud SQL instance '$SQL_INSTANCE'"
if ! gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  info "Creating Cloud SQL instance (this takes ~5 minutes)"
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_15 \
    --region="$REGION" \
    --tier=db-f1-micro \
    --storage-size=10GB \
    --storage-auto-increase \
    --backup-start-time=03:00 \
    --availability-type=zonal
fi

if ! gcloud sql databases describe "$SQL_DATABASE" --instance="$SQL_INSTANCE" >/dev/null 2>&1; then
  info "Creating database '$SQL_DATABASE'"
  gcloud sql databases create "$SQL_DATABASE" --instance="$SQL_INSTANCE"
fi

# Password handling: store once, re-use thereafter from Secret Manager.
if gcloud secrets describe mc-api-db-password >/dev/null 2>&1; then
  info "Reusing existing mc-api-db-password"
  SQL_PASS="$(gcloud secrets versions access latest --secret=mc-api-db-password)"
else
  info "Generating new Cloud SQL app-user password and storing in Secret Manager"
  SQL_PASS="$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-30)"
  printf '%s' "$SQL_PASS" | gcloud secrets create mc-api-db-password --data-file=- --replication-policy=automatic
fi

if gcloud sql users list --instance="$SQL_INSTANCE" --format='value(name)' | grep -qx "$SQL_USER"; then
  info "Updating password for Cloud SQL user '$SQL_USER'"
  gcloud sql users set-password "$SQL_USER" --instance="$SQL_INSTANCE" --password="$SQL_PASS" >/dev/null
else
  info "Creating Cloud SQL user '$SQL_USER'"
  gcloud sql users create "$SQL_USER" --instance="$SQL_INSTANCE" --password="$SQL_PASS"
fi

CLOUD_SQL_CONN="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
DATABASE_URL="postgresql://${SQL_USER}:${SQL_PASS}@/${SQL_DATABASE}?host=/cloudsql/${CLOUD_SQL_CONN}"

# -------------------------------------------------------------------------------------------------
# 4. Service accounts
# -------------------------------------------------------------------------------------------------
ensure_sa() {
  local NAME="$1" DISPLAY="$2"
  if ! gcloud iam service-accounts describe "${NAME}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$NAME" --display-name="$DISPLAY"
  fi
}
info "Ensuring service accounts"
ensure_sa "$WEB_SA"      "Mission Control web (Cloud Run)"
ensure_sa "$API_SA"      "Mission Control api (Cloud Run)"
ensure_sa "$SCRAPER_SA"  "Mission Control scraper (Cloud Run Job)"
ensure_sa "$SCHEDULER_SA" "Mission Control scheduler invoker"

# -------------------------------------------------------------------------------------------------
# 5. Secret Manager
# -------------------------------------------------------------------------------------------------
upsert_secret() {
  local SECRET="$1" VALUE="$2"
  if [ -z "$VALUE" ]; then
    return 0
  fi
  if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    gcloud secrets create "$SECRET" --replication-policy=automatic >/dev/null
  fi
  printf '%s' "$VALUE" | gcloud secrets versions add "$SECRET" --data-file=- >/dev/null
}

info "Writing secrets to Secret Manager"
upsert_secret mc-api-db-url     "$DATABASE_URL"
upsert_secret mc-turso-url      "$TURSO_DATABASE_URL"
upsert_secret mc-turso-token    "$TURSO_AUTH_TOKEN"
upsert_secret mc-openrouter     "${OPENROUTER_API_KEY:-}"
upsert_secret mc-firecrawl      "${FIRECRAWL_API_KEY:-}"
upsert_secret mc-serper         "${SERPER_API_KEY:-}"
upsert_secret mc-hubspot-token  "${HUBSPOT_ACCESS_TOKEN:-}"
upsert_secret mc-hubspot-portal "${HUBSPOT_PORTAL_ID:-}"
upsert_secret mc-google-sa-email "${GOOGLE_SERVICE_ACCOUNT_EMAIL:-}"
upsert_secret mc-google-sa-key   "${GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:-}"
upsert_secret mc-webhook-url     "${MISSION_CONTROL_WEBHOOK_URL:-}"
upsert_secret mc-webhook-secret  "${MISSION_CONTROL_WEBHOOK_SECRET:-}"

# AUTH_SECRET (NextAuth JWT signing) — generate once, reuse
if ! gcloud secrets describe mc-auth-secret >/dev/null 2>&1; then
  info "Generating NextAuth AUTH_SECRET"
  AUTH_SECRET_VALUE="$(openssl rand -base64 32)"
  upsert_secret mc-auth-secret "$AUTH_SECRET_VALUE"
fi

# -------------------------------------------------------------------------------------------------
# 6. OAuth client (the only manual step)
# -------------------------------------------------------------------------------------------------
# Google does not fully expose Web OAuth client creation via gcloud for Workspace "Internal" apps.
# We detect if the client already exists (stored as mc-google-client-id); if not, guide the user.
if ! gcloud secrets describe mc-google-client-id >/dev/null 2>&1; then
  cat <<EOF

========================================================================
MANUAL STEP (30 seconds): Create the OAuth 2.0 client for NextAuth.

1. Open: https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT_ID
   - User Type: Internal (Google Workspace)
   - App name: "Mission Control", support email: your @arrsys.com address.
   - Scopes: openid, email, profile (add them, then Save).

2. Open: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID
   - Create Credentials -> OAuth Client ID
   - Application type: Web application
   - Name: mc-web
   - Authorized redirect URIs: leave blank for now (we patch it after deploy).
   - Click Create. Copy the Client ID and Client Secret.
========================================================================
EOF
  read -r -p "Paste the OAuth Client ID: " GOOGLE_CLIENT_ID
  read -r -s -p "Paste the OAuth Client Secret: " GOOGLE_CLIENT_SECRET
  echo
  [ -n "$GOOGLE_CLIENT_ID" ] || die "Client ID required"
  [ -n "$GOOGLE_CLIENT_SECRET" ] || die "Client Secret required"
  upsert_secret mc-google-client-id     "$GOOGLE_CLIENT_ID"
  upsert_secret mc-google-client-secret "$GOOGLE_CLIENT_SECRET"
else
  info "Reusing existing mc-google-client-id / mc-google-client-secret"
fi

# -------------------------------------------------------------------------------------------------
# 7. IAM bindings
# -------------------------------------------------------------------------------------------------
bind_secret_access() {
  local SA="$1" SECRET="$2"
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --member="serviceAccount:${SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
      --role=roles/secretmanager.secretAccessor --condition=None >/dev/null 2>&1 || true
  fi
}

info "Granting Secret Manager access to service accounts"
for S in mc-auth-secret mc-google-client-id mc-google-client-secret mc-turso-url mc-turso-token \
         mc-openrouter mc-firecrawl mc-serper mc-hubspot-token mc-hubspot-portal \
         mc-google-sa-email mc-google-sa-key; do
  bind_secret_access "$WEB_SA" "$S"
done
for S in mc-api-db-url mc-webhook-url mc-webhook-secret; do
  bind_secret_access "$API_SA" "$S"
done
for S in mc-turso-url mc-turso-token mc-openrouter mc-firecrawl mc-serper; do
  bind_secret_access "$SCRAPER_SA" "$S"
done

info "Granting Cloud SQL Client to $API_SA"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${API_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/cloudsql.client --condition=None >/dev/null 2>&1 || true

info "Granting Cloud Build permissions (Run admin + SA user)"
for ROLE in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${CLOUDBUILD_SA}" \
    --role="$ROLE" --condition=None >/dev/null 2>&1 || true
done

# -------------------------------------------------------------------------------------------------
# 8. Apply Postgres schema
# -------------------------------------------------------------------------------------------------
info "Applying Postgres schema migrations"
bash "$SCRIPT_DIR/apply-pg-schema.sh" \
  "$PROJECT_ID" "$REGION" "$SQL_INSTANCE" "$SQL_DATABASE" "$SQL_USER" "$SQL_PASS"

# -------------------------------------------------------------------------------------------------
# 9. Build + deploy mc-api first (so we know its URL for mc-web)
# -------------------------------------------------------------------------------------------------
info "Building and deploying mc-api"
gcloud builds submit "$REPO_ROOT" \
  --gcs-source-staging-dir="$GCS_SOURCE_STAGING" \
  --config="$SCRIPT_DIR/cloudbuild.api.yaml" \
  --substitutions="_REGION=$REGION,_AR_REPO=$AR_REPO,_CLOUD_SQL_INSTANCE=$CLOUD_SQL_CONN"

API_URL="$(gcloud run services describe mc-api --region="$REGION" --format='value(status.url)')"
[ -n "$API_URL" ] || die "Could not read mc-api URL"
info "mc-api URL: $API_URL"

# Allow mc-web to invoke mc-api (api is private)
gcloud run services add-iam-policy-binding mc-api --region="$REGION" \
  --member="serviceAccount:${WEB_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/run.invoker --condition=None >/dev/null 2>&1 || true
gcloud run services add-iam-policy-binding mc-api --region="$REGION" \
  --member="serviceAccount:${SCRAPER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/run.invoker --condition=None >/dev/null 2>&1 || true

# -------------------------------------------------------------------------------------------------
# 10. Build + deploy mc-web with API_URL wired in
# -------------------------------------------------------------------------------------------------
info "Building and deploying mc-web"
gcloud builds submit "$REPO_ROOT" \
  --gcs-source-staging-dir="$GCS_SOURCE_STAGING" \
  --config="$SCRIPT_DIR/cloudbuild.web.yaml" \
  --substitutions="_REGION=$REGION,_AR_REPO=$AR_REPO,_API_URL=$API_URL"

WEB_URL="$(gcloud run services describe mc-web --region="$REGION" --format='value(status.url)')"
[ -n "$WEB_URL" ] || die "Could not read mc-web URL"
info "mc-web URL: $WEB_URL"

# Tell mc-web its own public hostname (NextAuth needs this to build callback URLs).
gcloud run services update mc-web --region="$REGION" \
  --update-env-vars "NEXTAUTH_URL=$WEB_URL" >/dev/null

# -------------------------------------------------------------------------------------------------
# 11. Build + deploy mc-scraper Job
# -------------------------------------------------------------------------------------------------
info "Building and deploying mc-scraper (Cloud Run Job)"
gcloud builds submit "$REPO_ROOT" \
  --gcs-source-staging-dir="$GCS_SOURCE_STAGING" \
  --config="$SCRIPT_DIR/cloudbuild.scraper.yaml" \
  --substitutions="_REGION=$REGION,_AR_REPO=$AR_REPO"

# -------------------------------------------------------------------------------------------------
# 12. Cloud Scheduler -> Cloud Run Job (every 5 minutes)
# -------------------------------------------------------------------------------------------------
info "Ensuring Cloud Scheduler trigger 'mc-scraper-tick' (every 5 minutes)"

# Scheduler needs a service account allowed to invoke the Job.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SCHEDULER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/run.invoker --condition=None >/dev/null 2>&1 || true

JOB_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/mc-scraper:run"

if gcloud scheduler jobs describe mc-scraper-tick --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http mc-scraper-tick \
    --location="$REGION" \
    --schedule="*/5 * * * *" \
    --uri="$JOB_URI" \
    --http-method=POST \
    --oauth-service-account-email="${SCHEDULER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
else
  gcloud scheduler jobs create http mc-scraper-tick \
    --location="$REGION" \
    --schedule="*/5 * * * *" \
    --uri="$JOB_URI" \
    --http-method=POST \
    --oauth-service-account-email="${SCHEDULER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
fi

# -------------------------------------------------------------------------------------------------
# 13. Patch OAuth client redirect URI (manual hint + secret re-check)
# -------------------------------------------------------------------------------------------------
REDIRECT_URI="${WEB_URL}/api/auth/callback/google"
cat <<EOF

========================================================================
FINAL MANUAL STEP (10 seconds): add the redirect URI to your OAuth client.

Open: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID
  -> click the mc-web OAuth client -> "Authorized redirect URIs"
  -> add: $REDIRECT_URI
  -> Save.
========================================================================

EOF
pause "Press Enter once you have added the redirect URI..."

# -------------------------------------------------------------------------------------------------
# 14. Smoke checks
# -------------------------------------------------------------------------------------------------
info "Smoke-check: mc-web /healthz (public)"
if curl -fsS "$WEB_URL/healthz" >/dev/null; then
  echo "  OK: $WEB_URL/healthz responded 200"
else
  warn "mc-web /healthz did not respond 200 (could still be warming up)"
fi

info "Smoke-check: mc-api must refuse unauthenticated requests"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/health" || true)
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  echo "  OK: mc-api correctly refused public access (HTTP $CODE)"
else
  warn "mc-api returned HTTP $CODE to an unauthenticated request (expected 401/403)"
fi

echo
echo "================================================================"
echo "  Mission Control is live."
echo "  Dashboard: $WEB_URL"
echo "  API:       $API_URL (private; mc-web authenticates via ID token)"
echo "  Scheduler: mc-scraper-tick runs every 5 minutes"
echo "  Login restricted to @arrsys.com Google accounts."
echo "================================================================"
