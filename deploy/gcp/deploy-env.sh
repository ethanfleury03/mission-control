#!/usr/bin/env bash
# Deploy one Mission Control environment.
#
# Usage:
#   bash deploy/gcp/deploy-env.sh stage <PROJECT_ID> [REGION]
#   bash deploy/gcp/deploy-env.sh prod  <PROJECT_ID> [REGION]

set -euo pipefail

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

command -v gcloud >/dev/null 2>&1 || mc_die "gcloud not installed"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud config set run/region "$REGION" >/dev/null
gcloud config unset builds/region >/dev/null 2>&1 || true

mc_info "Preflight environment summary"
mc_print_env_summary

require_secret() {
  local secret="$1"
  if ! gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
    mc_die "required secret $secret is missing; run bootstrap-env.sh or create it before deploy"
  fi
}

secret_exists() {
  local secret="$1"
  gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1
}

for REQUIRED_SECRET in "$MC_API_DB_SECRET" "$MC_APP_DB_SECRET" "$MC_DB_PASSWORD_SECRET" "$MC_AUTH_SECRET" "$MC_GOOGLE_ID_SECRET" "$MC_GOOGLE_SECRET_SECRET"; do
  require_secret "$REQUIRED_SECRET"
done

if [ "$MC_ENV" = "stage" ]; then
  API_DB_URL="$(mc_secret_value_or_empty "$MC_API_DB_SECRET")"
  APP_DB_URL="$(mc_secret_value_or_empty "$MC_APP_DB_SECRET")"
  [[ "$API_DB_URL" == *"/missioncontrol_stage?"* ]] || mc_die "$MC_API_DB_SECRET does not point at missioncontrol_stage"
  [[ "$APP_DB_URL" == *"/missioncontrol_app_stage?"* ]] || mc_die "$MC_APP_DB_SECRET does not point at missioncontrol_app_stage"
  [[ "$API_DB_URL" != *"/missioncontrol?"* ]] || mc_die "$MC_API_DB_SECRET points at production database"
  [[ "$APP_DB_URL" != *"/missioncontrol_app?"* ]] || mc_die "$MC_APP_DB_SECRET points at production database"
fi

if [ "$MC_ENV" = "prod" ]; then
  API_DB_URL="$(mc_secret_value_or_empty "$MC_API_DB_SECRET")"
  APP_DB_URL="$(mc_secret_value_or_empty "$MC_APP_DB_SECRET")"
  [[ "$API_DB_URL" != *"_stage"* ]] || mc_die "$MC_API_DB_SECRET points at staging"
  [[ "$APP_DB_URL" != *"_stage"* ]] || mc_die "$MC_APP_DB_SECRET points at staging"
fi

CLOUDBUILD_BUCKET="${PROJECT_ID}_cloudbuild"
GCS_SOURCE_STAGING="gs://${CLOUDBUILD_BUCKET}/source"
CLOUD_SQL_CONN="${PROJECT_ID}:${REGION}:${MC_SQL_INSTANCE}"
SQL_PASS="$(gcloud secrets versions access latest --secret="$MC_DB_PASSWORD_SECRET" --project="$PROJECT_ID")"

if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" || ! -f "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
  if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
    mc_die "Application Default Credentials are missing. Run: gcloud auth application-default login"
  fi
fi

mc_info "Applying API database schema to $MC_API_DB"
bash "$SCRIPT_DIR/apply-pg-schema.sh" "$PROJECT_ID" "$REGION" "$MC_SQL_INSTANCE" "$MC_API_DB" "$MC_SQL_USER" "$SQL_PASS"

mc_info "Applying Prisma app schema to $MC_APP_DB"
bash "$SCRIPT_DIR/apply-prisma-schema.sh" "$PROJECT_ID" "$REGION" "$MC_SQL_INSTANCE" "$MC_APP_DB" "$MC_SQL_USER" "$SQL_PASS"

mc_info "Building and deploying $MC_API_SERVICE"
gcloud builds submit "$REPO_ROOT" \
  --gcs-source-staging-dir="$GCS_SOURCE_STAGING" \
  --config="$SCRIPT_DIR/cloudbuild.api.yaml" \
  --substitutions="_REGION=$REGION,_AR_REPO=$MC_AR_REPO,_SERVICE=$MC_API_SERVICE,_SERVICE_ACCOUNT=$MC_API_SA,_CLOUD_SQL_INSTANCE=$CLOUD_SQL_CONN,_API_DB_SECRET=$MC_API_DB_SECRET,_WEBHOOK_URL_SECRET=$MC_WEBHOOK_URL_SECRET,_WEBHOOK_SECRET_SECRET=$MC_WEBHOOK_SECRET_SECRET"

API_URL="$(gcloud run services describe "$MC_API_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
[ -n "$API_URL" ] || mc_die "Could not read $MC_API_SERVICE URL"

mc_info "Granting $MC_WEB_SA and $MC_SCRAPER_SA invoker on $MC_API_SERVICE"
gcloud run services add-iam-policy-binding "$MC_API_SERVICE" --region="$REGION" \
  --member="serviceAccount:${MC_WEB_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/run.invoker --condition=None >/dev/null 2>&1 || true
gcloud run services add-iam-policy-binding "$MC_API_SERVICE" --region="$REGION" \
  --member="serviceAccount:${MC_SCRAPER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/run.invoker --condition=None >/dev/null 2>&1 || true

mc_info "Building and deploying $MC_WEB_SERVICE"
gcloud builds submit "$REPO_ROOT" \
  --gcs-source-staging-dir="$GCS_SOURCE_STAGING" \
  --config="$SCRIPT_DIR/cloudbuild.web.yaml" \
  --substitutions="_REGION=$REGION,_AR_REPO=$MC_AR_REPO,_SERVICE=$MC_WEB_SERVICE,_SERVICE_ACCOUNT=$MC_WEB_SA,_API_URL=$API_URL,_CLOUD_SQL_INSTANCE=$CLOUD_SQL_CONN,_APP_DB_SECRET=$MC_APP_DB_SECRET,_AUTH_SECRET=$MC_AUTH_SECRET,_GOOGLE_ID_SECRET=$MC_GOOGLE_ID_SECRET,_GOOGLE_SECRET_SECRET=$MC_GOOGLE_SECRET_SECRET,_OPENROUTER_SECRET=$MC_OPENROUTER_SECRET,_IMAGE_OPENROUTER_SECRET=$MC_IMAGE_OPENROUTER_SECRET,_FIRECRAWL_SECRET=$MC_FIRECRAWL_SECRET,_SERPER_SECRET=$MC_SERPER_SECRET,_HUBSPOT_TOKEN_SECRET=$MC_HUBSPOT_TOKEN_SECRET,_HUBSPOT_PORTAL_SECRET=$MC_HUBSPOT_PORTAL_SECRET,_GOOGLE_SA_EMAIL_SECRET=$MC_GOOGLE_SA_EMAIL_SECRET,_GOOGLE_SA_KEY_SECRET=$MC_GOOGLE_SA_KEY_SECRET"

WEB_URL="$(gcloud run services describe "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
[ -n "$WEB_URL" ] || mc_die "Could not read $MC_WEB_SERVICE URL"
AUTH_PUBLIC_URL="${MC_PUBLIC_URL:-$WEB_URL}"

mc_info "Updating auth URL on $MC_WEB_SERVICE"
gcloud run services update "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" \
  --update-env-vars "NEXTAUTH_URL=$AUTH_PUBLIC_URL,AUTH_URL=$AUTH_PUBLIC_URL,IMAGE_OPENROUTER_CHAT_MODEL=$MC_IMAGE_CHAT_MODEL,IMAGE_OPENROUTER_IMAGE_MODEL=$MC_IMAGE_IMAGE_MODEL,IMAGE_OPENROUTER_VIDEO_MODEL=$MC_IMAGE_VIDEO_MODEL" >/dev/null

mc_info "Disabling Cloud Run Invoker IAM check on $MC_WEB_SERVICE"
gcloud run services update "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" \
  --no-invoker-iam-check >/dev/null

WEB_OPTIONAL_SECRETS=""
add_web_secret() {
  local env_name="$1"
  local secret="$2"
  if secret_exists "$secret"; then
    WEB_OPTIONAL_SECRETS="${WEB_OPTIONAL_SECRETS:+$WEB_OPTIONAL_SECRETS,}${env_name}=${secret}:latest"
  fi
}
add_web_secret OPENROUTER_API_KEY "$MC_OPENROUTER_SECRET"
add_web_secret IMAGE_OPENROUTER_API_KEY "$MC_IMAGE_OPENROUTER_SECRET"
add_web_secret FIRECRAWL_API_KEY "$MC_FIRECRAWL_SECRET"
add_web_secret SERPER_API_KEY "$MC_SERPER_SECRET"
add_web_secret HUBSPOT_ACCESS_TOKEN "$MC_HUBSPOT_TOKEN_SECRET"
add_web_secret HUBSPOT_PORTAL_ID "$MC_HUBSPOT_PORTAL_SECRET"
add_web_secret GOOGLE_SERVICE_ACCOUNT_EMAIL "$MC_GOOGLE_SA_EMAIL_SECRET"
add_web_secret GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY "$MC_GOOGLE_SA_KEY_SECRET"
if [ -n "$WEB_OPTIONAL_SECRETS" ]; then
  mc_info "Mounting optional secrets on $MC_WEB_SERVICE"
  gcloud run services update "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" \
    --update-secrets="$WEB_OPTIONAL_SECRETS" \
    --no-invoker-iam-check >/dev/null
fi

mc_info "Building and deploying $MC_SCRAPER_JOB"
gcloud builds submit "$REPO_ROOT" \
  --gcs-source-staging-dir="$GCS_SOURCE_STAGING" \
  --config="$SCRIPT_DIR/cloudbuild.scraper.yaml" \
  --substitutions="_REGION=$REGION,_AR_REPO=$MC_AR_REPO,_JOB=$MC_SCRAPER_JOB,_SERVICE_ACCOUNT=$MC_SCRAPER_SA,_CLOUD_SQL_INSTANCE=$CLOUD_SQL_CONN,_APP_DB_SECRET=$MC_APP_DB_SECRET,_OPENROUTER_SECRET=$MC_OPENROUTER_SECRET,_FIRECRAWL_SECRET=$MC_FIRECRAWL_SECRET,_SERPER_SECRET=$MC_SERPER_SECRET"

SCRAPER_OPTIONAL_SECRETS=""
add_scraper_secret() {
  local env_name="$1"
  local secret="$2"
  if secret_exists "$secret"; then
    SCRAPER_OPTIONAL_SECRETS="${SCRAPER_OPTIONAL_SECRETS:+$SCRAPER_OPTIONAL_SECRETS,}${env_name}=${secret}:latest"
  fi
}
add_scraper_secret OPENROUTER_API_KEY "$MC_OPENROUTER_SECRET"
add_scraper_secret FIRECRAWL_API_KEY "$MC_FIRECRAWL_SECRET"
add_scraper_secret SERPER_API_KEY "$MC_SERPER_SECRET"
if [ -n "$SCRAPER_OPTIONAL_SECRETS" ]; then
  mc_info "Mounting optional secrets on $MC_SCRAPER_JOB"
  gcloud run jobs update "$MC_SCRAPER_JOB" --region="$REGION" --project="$PROJECT_ID" \
    --update-secrets="$SCRAPER_OPTIONAL_SECRETS" >/dev/null
fi

mc_info "Ensuring scheduler job $MC_SCHEDULER_JOB"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${MC_SCHEDULER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/run.invoker --condition=None >/dev/null 2>&1 || true

JOB_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${MC_SCRAPER_JOB}:run"
if gcloud scheduler jobs describe "$MC_SCHEDULER_JOB" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$MC_SCHEDULER_JOB" \
    --location="$REGION" \
    --schedule="*/5 * * * *" \
    --uri="$JOB_URI" \
    --http-method=POST \
    --oauth-service-account-email="${MC_SCHEDULER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
else
  gcloud scheduler jobs create http "$MC_SCHEDULER_JOB" \
    --location="$REGION" \
    --schedule="*/5 * * * *" \
    --uri="$JOB_URI" \
    --http-method=POST \
    --oauth-service-account-email="${MC_SCHEDULER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
fi

if [ "$MC_ENV" = "stage" ] && [ "${MC_STAGE_SCHEDULER_ACTIVE:-0}" != "1" ]; then
  mc_info "Pausing staging scheduler job; set MC_STAGE_SCHEDULER_ACTIVE=1 before deploy to leave it active"
  gcloud scheduler jobs pause "$MC_SCHEDULER_JOB" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1 || true
fi

mc_info "Smoke-checking $MC_WEB_SERVICE /api/healthz"
WEB_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_URL/api/healthz" || echo 000)"

mc_info "Smoke-checking $MC_API_SERVICE public access"
API_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$API_URL/health/live" || echo 000)"

cat <<EOF

================================================================
$MC_ENV_LABEL deploy complete.

Dashboard: $WEB_URL
Public auth URL: $AUTH_PUBLIC_URL
API:       $API_URL (private)
Web health: HTTP $WEB_CODE (expect 200)
API public health: HTTP $API_CODE (expect 401 or 403)
OAuth callback to add:
  ${AUTH_PUBLIC_URL}/api/auth/callback/google
Scheduler: $MC_SCHEDULER_JOB
================================================================
EOF
