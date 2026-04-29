#!/usr/bin/env bash
# Create or update the GCP resources for one Mission Control environment.
#
# Usage:
#   bash deploy/gcp/bootstrap-env.sh stage <PROJECT_ID> [REGION]
#   bash deploy/gcp/bootstrap-env.sh prod  <PROJECT_ID> [REGION]
#
# Staging uses separate services, databases, service accounts, scheduler job,
# and secrets. It intentionally does not copy production data.

set -eo pipefail

ENVIRONMENT="${1:?environment required: stage or prod}"
PROJECT_ID="${2:?PROJECT_ID required}"
REGION="${3:-us-central1}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-config.sh"

mc_resolve_env "$ENVIRONMENT"
mc_assert_safe_env
mc_require_prod_branch
mc_validate_project_id "$PROJECT_ID"

if [[ -f "$REPO_ROOT/.env" ]]; then
  mc_info "Loading variables from $REPO_ROOT/.env"
  ENV_TMP="$(mktemp "${TMPDIR:-/tmp}/mc-bootstrap-env.XXXXXX")"
  tr -d '\r' < "$REPO_ROOT/.env" >"$ENV_TMP"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_TMP" || mc_die "Failed to parse $REPO_ROOT/.env"
  set +a
  rm -f "$ENV_TMP"
fi

set -uo pipefail

command -v gcloud >/dev/null 2>&1 || mc_die "gcloud not installed"
command -v openssl >/dev/null 2>&1 || mc_die "openssl required"

if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" || ! -f "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
  if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
    mc_die "Application Default Credentials are missing. Run: gcloud auth application-default login"
  fi
fi

mc_info "Using project $PROJECT_ID in region $REGION"
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud config set run/region "$REGION" >/dev/null
gcloud config unset builds/region >/dev/null 2>&1 || true

mc_info "Preflight environment summary"
mc_print_env_summary

mc_info "Enabling required GCP APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  serviceusage.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  certificatemanager.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  compute.googleapis.com

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
CLOUDBUILD_AGENT_SA="service-${PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com"

gcloud beta services identity create --service=cloudbuild.googleapis.com --project="$PROJECT_ID" >/dev/null 2>&1 || true
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_AGENT_SA}" \
  --role=roles/cloudbuild.serviceAgent --condition=None >/dev/null 2>&1 || true

CLOUDBUILD_BUCKET="${PROJECT_ID}_cloudbuild"
mc_info "Ensuring Cloud Build bucket gs://${CLOUDBUILD_BUCKET}"
if gcloud storage buckets describe "gs://${CLOUDBUILD_BUCKET}" --project="$PROJECT_ID" >/dev/null 2>&1; then
  EXISTING_LOC="$(gcloud storage buckets describe "gs://${CLOUDBUILD_BUCKET}" --format='value(location)' 2>/dev/null || true)"
  [ -z "$EXISTING_LOC" ] || [ "$EXISTING_LOC" = "US" ] || mc_die "Cloud Build bucket must be in multi-region US, found $EXISTING_LOC"
else
  gcloud storage buckets create "gs://${CLOUDBUILD_BUCKET}" \
    --project="$PROJECT_ID" \
    --location=US \
    --uniform-bucket-level-access
fi

grant_bucket_access() {
  local member="$1"
  gcloud storage buckets add-iam-policy-binding "gs://${CLOUDBUILD_BUCKET}" \
    --member="$member" \
    --role=roles/storage.admin >/dev/null 2>&1 || true
}
grant_bucket_access "serviceAccount:${CLOUDBUILD_AGENT_SA}"
if gcloud iam service-accounts describe "${CLOUDBUILD_SA}" --project="$PROJECT_ID" >/dev/null 2>&1; then
  grant_bucket_access "serviceAccount:${CLOUDBUILD_SA}"
fi
SUBMITTER_ACCOUNT="$(gcloud config get-value account 2>/dev/null || true)"
if [[ -n "$SUBMITTER_ACCOUNT" && "$SUBMITTER_ACCOUNT" != "(unset)" ]]; then
  if [[ "$SUBMITTER_ACCOUNT" == *.iam.gserviceaccount.com ]]; then
    grant_bucket_access "serviceAccount:${SUBMITTER_ACCOUNT}"
  else
    grant_bucket_access "user:${SUBMITTER_ACCOUNT}"
  fi
fi

mc_info "Ensuring Artifact Registry repo $MC_AR_REPO"
if ! gcloud artifacts repositories describe "$MC_AR_REPO" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$MC_AR_REPO" \
    --repository-format=docker --location="$REGION" \
    --description="Mission Control container images"
fi

mc_info "Ensuring Cloud SQL instance $MC_SQL_INSTANCE"
if ! gcloud sql instances describe "$MC_SQL_INSTANCE" >/dev/null 2>&1; then
  mc_info "Creating Cloud SQL instance; this can take several minutes"
  gcloud sql instances create "$MC_SQL_INSTANCE" \
    --database-version=POSTGRES_15 \
    --region="$REGION" \
    --tier=db-f1-micro \
    --storage-size=10GB \
    --storage-auto-increase \
    --backup-start-time=03:00 \
    --availability-type=zonal
fi

for DB in "$MC_API_DB" "$MC_APP_DB"; do
  if ! gcloud sql databases describe "$DB" --instance="$MC_SQL_INSTANCE" >/dev/null 2>&1; then
    mc_info "Creating database $DB"
    gcloud sql databases create "$DB" --instance="$MC_SQL_INSTANCE"
  fi
done

if gcloud secrets describe "$MC_DB_PASSWORD_SECRET" >/dev/null 2>&1; then
  SQL_PASS="$(gcloud secrets versions access latest --secret="$MC_DB_PASSWORD_SECRET")"
else
  mc_info "Generating Cloud SQL app-user password"
  SQL_PASS="$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-30)"
  mc_upsert_secret "$MC_DB_PASSWORD_SECRET" "$SQL_PASS"
fi

if gcloud sql users list --instance="$MC_SQL_INSTANCE" --format='value(name)' | grep -qx "$MC_SQL_USER"; then
  gcloud sql users set-password "$MC_SQL_USER" --instance="$MC_SQL_INSTANCE" --password="$SQL_PASS" >/dev/null
else
  gcloud sql users create "$MC_SQL_USER" --instance="$MC_SQL_INSTANCE" --password="$SQL_PASS"
fi

CLOUD_SQL_CONN="${PROJECT_ID}:${REGION}:${MC_SQL_INSTANCE}"
SQL_USER_ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$MC_SQL_USER")"
SQL_PASS_ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$SQL_PASS")"
API_DATABASE_URL="postgresql://${SQL_USER_ENC}:${SQL_PASS_ENC}@127.0.0.1/${MC_API_DB}?host=/cloudsql/${CLOUD_SQL_CONN}"
APP_DATABASE_URL="postgresql://${SQL_USER_ENC}:${SQL_PASS_ENC}@127.0.0.1/${MC_APP_DB}?host=/cloudsql/${CLOUD_SQL_CONN}"

if [ "$MC_ENV" = "stage" ]; then
  [[ "$API_DATABASE_URL" == *"/missioncontrol_stage?"* ]] || mc_die "stage API DATABASE_URL does not target missioncontrol_stage"
  [[ "$APP_DATABASE_URL" == *"/missioncontrol_app_stage?"* ]] || mc_die "stage app DATABASE_URL does not target missioncontrol_app_stage"
fi

mc_info "Writing environment DB secrets"
mc_upsert_secret "$MC_API_DB_SECRET" "$API_DATABASE_URL"
mc_upsert_secret "$MC_APP_DB_SECRET" "$APP_DATABASE_URL"

ensure_sa() {
  local name="$1"
  local display="$2"
  if ! gcloud iam service-accounts describe "${name}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$name" --display-name="$display"
  fi
}

mc_info "Ensuring service accounts"
ensure_sa "$MC_WEB_SA" "Mission Control ${MC_ENV} web (Cloud Run)"
ensure_sa "$MC_API_SA" "Mission Control ${MC_ENV} api (Cloud Run)"
ensure_sa "$MC_SCRAPER_SA" "Mission Control ${MC_ENV} scraper (Cloud Run Job)"
ensure_sa "$MC_SCHEDULER_SA" "Mission Control ${MC_ENV} scheduler invoker"
ensure_sa "$MC_BUILD_RUNNER_SA" "Mission Control Cloud Build worker"

RUNNER_EMAIL="${MC_BUILD_RUNNER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
for ROLE in roles/logging.logWriter roles/artifactregistry.writer roles/run.admin roles/cloudsql.client roles/secretmanager.secretAccessor roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNNER_EMAIL}" \
    --role="$ROLE" --condition=None >/dev/null 2>&1 || true
done
for SA in "$MC_API_SA" "$MC_WEB_SA" "$MC_SCRAPER_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "${SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --member="serviceAccount:${RUNNER_EMAIL}" \
    --role=roles/iam.serviceAccountUser --condition=None >/dev/null 2>&1 || true
done
gcloud iam service-accounts add-iam-policy-binding "${RUNNER_EMAIL}" \
  --member="serviceAccount:${CLOUDBUILD_AGENT_SA}" \
  --role=roles/iam.serviceAccountTokenCreator --condition=None >/dev/null 2>&1 || true
grant_bucket_access "serviceAccount:${RUNNER_EMAIL}"

mc_info "Ensuring auth and optional secrets"
if ! gcloud secrets describe "$MC_AUTH_SECRET" >/dev/null 2>&1; then
  mc_upsert_secret "$MC_AUTH_SECRET" "$(openssl rand -base64 32)"
fi

if [ "$MC_ENV" = "stage" ]; then
  mc_copy_secret_if_present mc-google-client-id "$MC_GOOGLE_ID_SECRET"
  mc_copy_secret_if_present mc-google-client-secret "$MC_GOOGLE_SECRET_SECRET"
  mc_copy_secret_if_present mc-openrouter "$MC_OPENROUTER_SECRET"
  mc_copy_secret_if_present mc-image-openrouter "$MC_IMAGE_OPENROUTER_SECRET"
  mc_copy_secret_if_present mc-firecrawl "$MC_FIRECRAWL_SECRET"
  mc_copy_secret_if_present mc-serper "$MC_SERPER_SECRET"
  mc_copy_secret_if_present mc-hubspot-token "$MC_HUBSPOT_TOKEN_SECRET"
  mc_copy_secret_if_present mc-hubspot-portal "$MC_HUBSPOT_PORTAL_SECRET"
  mc_copy_secret_if_present mc-google-sa-email "$MC_GOOGLE_SA_EMAIL_SECRET"
  mc_copy_secret_if_present mc-google-sa-key "$MC_GOOGLE_SA_KEY_SECRET"
  mc_copy_secret_if_present mc-webhook-url "$MC_WEBHOOK_URL_SECRET"
  mc_copy_secret_if_present mc-webhook-secret "$MC_WEBHOOK_SECRET_SECRET"
else
  mc_upsert_secret "$MC_OPENROUTER_SECRET" "${OPENROUTER_API_KEY:-}"
  mc_upsert_secret "$MC_IMAGE_OPENROUTER_SECRET" "${IMAGE_OPENROUTER_API_KEY:-}"
  mc_upsert_secret "$MC_FIRECRAWL_SECRET" "${FIRECRAWL_API_KEY:-}"
  mc_upsert_secret "$MC_SERPER_SECRET" "${SERPER_API_KEY:-}"
  mc_upsert_secret "$MC_HUBSPOT_TOKEN_SECRET" "${HUBSPOT_ACCESS_TOKEN:-}"
  mc_upsert_secret "$MC_HUBSPOT_PORTAL_SECRET" "${HUBSPOT_PORTAL_ID:-}"
  mc_upsert_secret "$MC_GOOGLE_SA_EMAIL_SECRET" "${GOOGLE_SERVICE_ACCOUNT_EMAIL:-}"
  mc_upsert_secret "$MC_GOOGLE_SA_KEY_SECRET" "${GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:-}"
  mc_upsert_secret "$MC_WEBHOOK_URL_SECRET" "${MISSION_CONTROL_WEBHOOK_URL:-}"
  mc_upsert_secret "$MC_WEBHOOK_SECRET_SECRET" "${MISSION_CONTROL_WEBHOOK_SECRET:-}"
fi

if ! gcloud secrets describe "$MC_GOOGLE_ID_SECRET" >/dev/null 2>&1 || ! gcloud secrets describe "$MC_GOOGLE_SECRET_SECRET" >/dev/null 2>&1; then
  cat <<EOF

========================================================================
Google OAuth secrets are missing for $MC_ENV.

Create or copy a Web OAuth client, then store:
  $MC_GOOGLE_ID_SECRET
  $MC_GOOGLE_SECRET_SECRET

You can add them later with:
  printf '%s' '<client-id>' | gcloud secrets create $MC_GOOGLE_ID_SECRET --data-file=- --replication-policy=automatic
  printf '%s' '<client-secret>' | gcloud secrets create $MC_GOOGLE_SECRET_SECRET --data-file=- --replication-policy=automatic
========================================================================
EOF
else
  mc_info "OAuth secrets are present"
fi

bind_secret_access() {
  local sa="$1"
  local secret="$2"
  if gcloud secrets describe "$secret" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$secret" \
      --member="serviceAccount:${sa}@${PROJECT_ID}.iam.gserviceaccount.com" \
      --role=roles/secretmanager.secretAccessor --condition=None >/dev/null 2>&1 || true
  fi
}

mc_info "Granting Secret Manager access"
for S in "$MC_AUTH_SECRET" "$MC_GOOGLE_ID_SECRET" "$MC_GOOGLE_SECRET_SECRET" "$MC_APP_DB_SECRET" \
         "$MC_OPENROUTER_SECRET" "$MC_IMAGE_OPENROUTER_SECRET" "$MC_FIRECRAWL_SECRET" "$MC_SERPER_SECRET" \
         "$MC_HUBSPOT_TOKEN_SECRET" "$MC_HUBSPOT_PORTAL_SECRET" "$MC_GOOGLE_SA_EMAIL_SECRET" "$MC_GOOGLE_SA_KEY_SECRET"; do
  bind_secret_access "$MC_WEB_SA" "$S"
done
for S in "$MC_API_DB_SECRET" "$MC_WEBHOOK_URL_SECRET" "$MC_WEBHOOK_SECRET_SECRET"; do
  bind_secret_access "$MC_API_SA" "$S"
done
for S in "$MC_APP_DB_SECRET" "$MC_OPENROUTER_SECRET" "$MC_FIRECRAWL_SECRET" "$MC_SERPER_SECRET"; do
  bind_secret_access "$MC_SCRAPER_SA" "$S"
done

mc_info "Granting Cloud SQL Client"
for SA in "$MC_API_SA" "$MC_WEB_SA" "$MC_SCRAPER_SA"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role=roles/cloudsql.client --condition=None >/dev/null 2>&1 || true
done

mc_info "Applying API database schema to $MC_API_DB"
bash "$SCRIPT_DIR/apply-pg-schema.sh" "$PROJECT_ID" "$REGION" "$MC_SQL_INSTANCE" "$MC_API_DB" "$MC_SQL_USER" "$SQL_PASS"

mc_info "Applying Prisma app schema to $MC_APP_DB"
bash "$SCRIPT_DIR/apply-prisma-schema.sh" "$PROJECT_ID" "$REGION" "$MC_SQL_INSTANCE" "$MC_APP_DB" "$MC_SQL_USER" "$SQL_PASS"

cat <<EOF

================================================================
$MC_ENV_LABEL resources are ready.

Next deploy:
  bash deploy/gcp/deploy-env.sh $MC_ENV $PROJECT_ID $REGION
================================================================
EOF
