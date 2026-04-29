#!/usr/bin/env bash
# Deploy only the Mission Control web service for one environment.
#
# Usage:
#   bash deploy/gcp/deploy-web-env.sh stage <PROJECT_ID> [REGION]
#   bash deploy/gcp/deploy-web-env.sh prod  <PROJECT_ID> [REGION]
#
# This intentionally skips DB migrations, mc-api, mc-scraper, scheduler updates,
# and API IAM bindings. Use deploy-env.sh when backend/schema/scraper resources changed.

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

for REQUIRED_SECRET in "$MC_APP_DB_SECRET" "$MC_AUTH_SECRET" "$MC_GOOGLE_ID_SECRET" "$MC_GOOGLE_SECRET_SECRET"; do
  require_secret "$REQUIRED_SECRET"
done

if [ "$MC_ENV" = "stage" ]; then
  APP_DB_URL="$(mc_secret_value_or_empty "$MC_APP_DB_SECRET")"
  [[ "$APP_DB_URL" == *"/missioncontrol_app_stage?"* ]] || mc_die "$MC_APP_DB_SECRET does not point at missioncontrol_app_stage"
  [[ "$APP_DB_URL" != *"/missioncontrol_app?"* ]] || mc_die "$MC_APP_DB_SECRET points at production database"
fi

if [ "$MC_ENV" = "prod" ]; then
  APP_DB_URL="$(mc_secret_value_or_empty "$MC_APP_DB_SECRET")"
  [[ "$APP_DB_URL" != *"_stage"* ]] || mc_die "$MC_APP_DB_SECRET points at staging"
fi

mc_info "Preflight web-only environment summary"
mc_print_env_summary

CLOUDBUILD_BUCKET="${PROJECT_ID}_cloudbuild"
GCS_SOURCE_STAGING="gs://${CLOUDBUILD_BUCKET}/source"
CLOUD_SQL_CONN="${PROJECT_ID}:${REGION}:${MC_SQL_INSTANCE}"

API_URL="$(gcloud run services describe "$MC_API_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)' 2>/dev/null || true)"
[ -n "$API_URL" ] || mc_die "could not read $MC_API_SERVICE URL. Run deploy-env.sh once, or deploy the API first."

EXISTING_WEB_URL="$(gcloud run services describe "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)' 2>/dev/null || true)"
AUTH_PUBLIC_URL="${MC_PUBLIC_URL:-$EXISTING_WEB_URL}"

if [ -z "$AUTH_PUBLIC_URL" ]; then
  mc_warn "No existing $MC_WEB_SERVICE URL found; NEXTAUTH_URL will not be set during this first web-only deploy."
  mc_warn "Run this script once more after the service exists, or use deploy-env.sh for first deploy."
fi

mc_info "Building and deploying only $MC_WEB_SERVICE"
gcloud builds submit "$REPO_ROOT" \
  --gcs-source-staging-dir="$GCS_SOURCE_STAGING" \
  --config="$SCRIPT_DIR/cloudbuild.web.yaml" \
  --substitutions="_REGION=$REGION,_AR_REPO=$MC_AR_REPO,_SERVICE=$MC_WEB_SERVICE,_SERVICE_ACCOUNT=$MC_WEB_SA,_API_URL=$API_URL,_AUTH_PUBLIC_URL=$AUTH_PUBLIC_URL,_CLOUD_SQL_INSTANCE=$CLOUD_SQL_CONN,_APP_DB_SECRET=$MC_APP_DB_SECRET,_AUTH_SECRET=$MC_AUTH_SECRET,_GOOGLE_ID_SECRET=$MC_GOOGLE_ID_SECRET,_GOOGLE_SECRET_SECRET=$MC_GOOGLE_SECRET_SECRET,_OPENROUTER_SECRET=$MC_OPENROUTER_SECRET,_IMAGE_OPENROUTER_SECRET=$MC_IMAGE_OPENROUTER_SECRET,_FIRECRAWL_SECRET=$MC_FIRECRAWL_SECRET,_SERPER_SECRET=$MC_SERPER_SECRET,_HUBSPOT_TOKEN_SECRET=$MC_HUBSPOT_TOKEN_SECRET,_HUBSPOT_PORTAL_SECRET=$MC_HUBSPOT_PORTAL_SECRET,_GOOGLE_SA_EMAIL_SECRET=$MC_GOOGLE_SA_EMAIL_SECRET,_GOOGLE_SA_KEY_SECRET=$MC_GOOGLE_SA_KEY_SECRET,_IMAGE_CHAT_MODEL=$MC_IMAGE_CHAT_MODEL,_IMAGE_IMAGE_MODEL=$MC_IMAGE_IMAGE_MODEL,_IMAGE_VIDEO_MODEL=$MC_IMAGE_VIDEO_MODEL"

WEB_URL="$(gcloud run services describe "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
[ -n "$WEB_URL" ] || mc_die "could not read $MC_WEB_SERVICE URL after deploy"

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

if [ -z "$AUTH_PUBLIC_URL" ]; then
  AUTH_PUBLIC_URL="$WEB_URL"
  mc_info "Setting auth URL on first web-only deploy"
  gcloud run services update "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" \
    --update-env-vars "NEXTAUTH_URL=$AUTH_PUBLIC_URL,AUTH_URL=$AUTH_PUBLIC_URL" \
    --no-invoker-iam-check >/dev/null
fi

mc_info "Smoke-checking $MC_WEB_SERVICE /api/healthz"
WEB_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_URL/api/healthz" || echo 000)"

cat <<EOF

================================================================
$MC_ENV_LABEL web-only deploy complete.

Dashboard: $WEB_URL
Public auth URL: $AUTH_PUBLIC_URL
API:       $API_URL (existing private service)
Web health: HTTP $WEB_CODE (expect 200)
OAuth callback:
  ${AUTH_PUBLIC_URL}/api/auth/callback/google
================================================================
EOF
