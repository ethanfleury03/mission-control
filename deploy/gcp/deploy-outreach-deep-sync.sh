#!/usr/bin/env bash
# Deploy the production Outreach Deep Sync bridge and wire prod Mission Control to it.
#
# Usage:
#   bash deploy/gcp/deploy-outreach-deep-sync.sh prod <PROJECT_ID> [REGION]

set -euo pipefail

ENVIRONMENT="${1:?environment required: prod}"
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

[ "$MC_ENV" = "prod" ] || mc_die "Outreach Deep Sync Cloud Run bridge is production-only. Staging should remain unavailable."

command -v gcloud >/dev/null 2>&1 || mc_die "gcloud not installed"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud config set run/region "$REGION" >/dev/null
gcloud config unset builds/region >/dev/null 2>&1 || true

ensure_sa() {
  local name="$1"
  local display="$2"
  if ! gcloud iam service-accounts describe "${name}@${PROJECT_ID}.iam.gserviceaccount.com" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$name" --project="$PROJECT_ID" --display-name="$display" >/dev/null
  fi
  for _ in $(seq 1 30); do
    if gcloud iam service-accounts describe "${name}@${PROJECT_ID}.iam.gserviceaccount.com" --project="$PROJECT_ID" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  mc_die "service account ${name}@${PROJECT_ID}.iam.gserviceaccount.com was not visible after creation"
}

ensure_random_secret() {
  local secret="$1"
  if ! gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
    mc_info "Creating missing secret $secret"
    openssl rand -base64 32 | gcloud secrets create "$secret" \
      --project="$PROJECT_ID" \
      --replication-policy=automatic \
      --data-file=- >/dev/null
  fi
}

ensure_random_secret "$MC_OUTREACH_WEBHOOK_SECRET_SECRET"
ensure_random_secret "$MC_OUTREACH_SERVICE_TOKEN_SECRET"

STATE_BUCKET="${MC_OUTREACH_STATE_BUCKET:-${PROJECT_ID}-sasha-outreach-state}"
STATE_OBJECT="prod/state.json"
STATE_GCS_URI="gs://${STATE_BUCKET}/${STATE_OBJECT}"
AGENTS_GCS_URI="gs://${STATE_BUCKET}/prod/agents.json"
CLOUDBUILD_BUCKET="${PROJECT_ID}_cloudbuild"
GCS_SOURCE_STAGING="gs://${CLOUDBUILD_BUCKET}/source"

mc_info "Ensuring prod Outreach state bucket gs://$STATE_BUCKET"
if ! gcloud storage buckets describe "gs://$STATE_BUCKET" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$STATE_BUCKET" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access >/dev/null
fi

ensure_sa "$MC_OUTREACH_DEEP_SYNC_SA" "Mission Control prod Outreach Deep Sync bridge"
gcloud storage buckets add-iam-policy-binding "gs://$STATE_BUCKET" \
  --member="serviceAccount:${MC_OUTREACH_DEEP_SYNC_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/storage.objectViewer >/dev/null
gcloud secrets add-iam-policy-binding "$MC_OUTREACH_WEBHOOK_SECRET_SECRET" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${MC_OUTREACH_DEEP_SYNC_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor >/dev/null
gcloud iam service-accounts add-iam-policy-binding "${MC_OUTREACH_DEEP_SYNC_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${MC_BUILD_RUNNER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser >/dev/null

mc_info "Building and deploying $MC_OUTREACH_DEEP_SYNC_SERVICE"
gcloud builds submit "$REPO_ROOT" \
  --gcs-source-staging-dir="$GCS_SOURCE_STAGING" \
  --config="$SCRIPT_DIR/cloudbuild.outreach-deep-sync.yaml" \
  --substitutions="_REGION=$REGION,_AR_REPO=$MC_AR_REPO,_SERVICE=$MC_OUTREACH_DEEP_SYNC_SERVICE,_SERVICE_ACCOUNT=$MC_OUTREACH_DEEP_SYNC_SA,_STATE_GCS_URI=$STATE_GCS_URI,_AGENTS_GCS_URI=$AGENTS_GCS_URI,_OUTREACH_WEBHOOK_SECRET_SECRET=$MC_OUTREACH_WEBHOOK_SECRET_SECRET"

BRIDGE_URL="$(gcloud run services describe "$MC_OUTREACH_DEEP_SYNC_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
[ -n "$BRIDGE_URL" ] || mc_die "could not read $MC_OUTREACH_DEEP_SYNC_SERVICE URL"

mc_info "Saving bridge URL to $MC_OUTREACH_OPENCLAW_GATEWAY_URL_SECRET"
mc_upsert_secret "$MC_OUTREACH_OPENCLAW_GATEWAY_URL_SECRET" "$BRIDGE_URL"

WEB_URL="$(gcloud run services describe "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)' 2>/dev/null || true)"
if [ -n "$WEB_URL" ]; then
  for SECRET in "$MC_OUTREACH_OPENCLAW_GATEWAY_URL_SECRET" "$MC_OUTREACH_WEBHOOK_SECRET_SECRET" "$MC_OUTREACH_SERVICE_TOKEN_SECRET"; do
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --project="$PROJECT_ID" \
      --member="serviceAccount:${MC_WEB_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
      --role=roles/secretmanager.secretAccessor >/dev/null
  done
  mc_info "Wiring prod Mission Control web to $MC_OUTREACH_DEEP_SYNC_SERVICE"
  gcloud run services update "$MC_WEB_SERVICE" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --update-env-vars "OUTREACH_CRM_DEEP_SYNC_ENABLED=true,OUTREACH_CRM_OPENCLAW_TRANSPORT=gateway,OUTREACH_CRM_OPENCLAW_AGENT_ID=sasha-outreach,OUTREACH_CRM_CALLBACK_URL=${MC_PUBLIC_URL:-$WEB_URL}/api/outreach-crm/v1/openclaw/callback" \
    --update-secrets "OUTREACH_CRM_OPENCLAW_GATEWAY_URL=$MC_OUTREACH_OPENCLAW_GATEWAY_URL_SECRET:latest,OUTREACH_CRM_WEBHOOK_SECRET=$MC_OUTREACH_WEBHOOK_SECRET_SECRET:latest,OUTREACH_CRM_SERVICE_TOKEN=$MC_OUTREACH_SERVICE_TOKEN_SECRET:latest" \
    --no-invoker-iam-check >/dev/null
fi

cat <<EOF

================================================================
Production Outreach Deep Sync bridge deployed.

Bridge:       $BRIDGE_URL
State object: $STATE_GCS_URI
Mission Ctrl: ${WEB_URL:-"(web service not found yet)"}

Before the first Sync, upload the current state:
  bash deploy/gcp/upload-prod-outreach-state.sh "$PROJECT_ID" /Users/sasha/.openclaw/workspace/scripts/sasha_outreach "$REGION"
================================================================
EOF
