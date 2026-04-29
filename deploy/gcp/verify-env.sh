#!/usr/bin/env bash
# Verify one Mission Control GCP environment.
#
# Usage:
#   bash deploy/gcp/verify-env.sh stage <PROJECT_ID> [REGION]
#   bash deploy/gcp/verify-env.sh prod  <PROJECT_ID> [REGION]

set -euo pipefail

ENVIRONMENT="${1:?environment required: stage or prod}"
PROJECT_ID="${2:?PROJECT_ID required}"
REGION="${3:-us-central1}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-config.sh"

mc_resolve_env "$ENVIRONMENT"
mc_assert_safe_env
mc_validate_project_id "$PROJECT_ID"

gcloud config set project "$PROJECT_ID" >/dev/null

echo "=== Environment ==="
mc_print_env_summary

echo ""
echo "=== Cloud Run: $MC_WEB_SERVICE ==="
if gcloud run services describe "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  WEB_URL="$(gcloud run services describe "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
  echo "WEB_URL=$WEB_URL"
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_URL/api/healthz" || echo 000)"
  echo "GET /api/healthz -> HTTP $code (expect 200)"
  WEB_SERVICE_JSON="$(gcloud run services describe "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format=json)"
  NEXTAUTH_URL="$(python3 -c 'import json,sys; data=json.load(sys.stdin); envs=data.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [{}])[0].get("env", []); print(next((env.get("value", "") for env in envs if env.get("name") == "NEXTAUTH_URL"), ""))' <<<"$WEB_SERVICE_JSON")"
  AUTH_URL="$(python3 -c 'import json,sys; data=json.load(sys.stdin); envs=data.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [{}])[0].get("env", []); print(next((env.get("value", "") for env in envs if env.get("name") == "AUTH_URL"), ""))' <<<"$WEB_SERVICE_JSON")"
  echo "NEXTAUTH_URL=${NEXTAUTH_URL:-"(unset)"}"
  echo "AUTH_URL=${AUTH_URL:-"(unset)"}"
  INVOKER_IAM_DISABLED="$(python3 -c 'import json,sys; data=json.load(sys.stdin); anns=data.get("metadata", {}).get("annotations", {}); print(anns.get("run.googleapis.com/invoker-iam-disabled", ""))' <<<"$WEB_SERVICE_JSON")"
  if [ "$INVOKER_IAM_DISABLED" = "true" ]; then
    echo "Cloud Run Invoker IAM check: disabled"
  else
    echo "Cloud Run Invoker IAM check: enabled (run: gcloud run services update $MC_WEB_SERVICE --region=$REGION --project=$PROJECT_ID --no-invoker-iam-check)"
  fi
  echo "OAuth callback:"
  echo "  ${AUTH_URL:-$WEB_URL}/api/auth/callback/google"
else
  echo "$MC_WEB_SERVICE: NOT FOUND"
fi

echo ""
echo "=== Cloud Run: $MC_API_SERVICE ==="
if gcloud run services describe "$MC_API_SERVICE" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  API_URL="$(gcloud run services describe "$MC_API_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
  echo "API_URL=$API_URL"
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$API_URL/health/live" || echo 000)"
  echo "GET /health/live (no auth) -> HTTP $code (expect 401 or 403)"
else
  echo "$MC_API_SERVICE: NOT FOUND"
fi

echo ""
echo "=== Cloud Run Job: $MC_SCRAPER_JOB ==="
gcloud run jobs describe "$MC_SCRAPER_JOB" --region="$REGION" --project="$PROJECT_ID" --format='value(metadata.name)' 2>/dev/null || echo "$MC_SCRAPER_JOB: NOT FOUND"

echo ""
echo "=== Cloud Scheduler: $MC_SCHEDULER_JOB ==="
gcloud scheduler jobs describe "$MC_SCHEDULER_JOB" --location="$REGION" --project="$PROJECT_ID" --format='table(name,state,schedule)' 2>/dev/null || echo "$MC_SCHEDULER_JOB: NOT FOUND"

echo ""
echo "=== Secret URL Guard ==="
API_DB_URL="$(mc_secret_value_or_empty "$MC_API_DB_SECRET")"
APP_DB_URL="$(mc_secret_value_or_empty "$MC_APP_DB_SECRET")"
if [ "$MC_ENV" = "stage" ]; then
  [[ "$API_DB_URL" == *"/missioncontrol_stage?"* ]] && echo "OK: $MC_API_DB_SECRET targets missioncontrol_stage" || echo "FAIL: $MC_API_DB_SECRET does not target missioncontrol_stage"
  [[ "$APP_DB_URL" == *"/missioncontrol_app_stage?"* ]] && echo "OK: $MC_APP_DB_SECRET targets missioncontrol_app_stage" || echo "FAIL: $MC_APP_DB_SECRET does not target missioncontrol_app_stage"
else
  [[ "$API_DB_URL" != *"_stage"* ]] && echo "OK: $MC_API_DB_SECRET is not staging" || echo "FAIL: $MC_API_DB_SECRET points at staging"
  [[ "$APP_DB_URL" != *"_stage"* ]] && echo "OK: $MC_APP_DB_SECRET is not staging" || echo "FAIL: $MC_APP_DB_SECRET points at staging"
fi

echo ""
echo "=== Done ==="
