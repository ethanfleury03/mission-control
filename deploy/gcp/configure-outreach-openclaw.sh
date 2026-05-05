#!/usr/bin/env bash
# Configure Mission Control Outreach CRM to call an OpenClaw deep-sync gateway.
#
# Usage:
#   bash deploy/gcp/configure-outreach-openclaw.sh prod <PROJECT_ID> <GATEWAY_URL> [REGION] [WEBHOOK_URL]

set -euo pipefail

ENVIRONMENT="${1:?environment required: stage or prod}"
PROJECT_ID="${2:?PROJECT_ID required}"
GATEWAY_URL="${3:?OpenClaw gateway URL required}"
REGION="${4:-us-central1}"
WEBHOOK_URL="${5:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-config.sh"

mc_resolve_env "$ENVIRONMENT"
mc_assert_safe_env
mc_validate_project_id "$PROJECT_ID"

[ "$MC_ENV" = "prod" ] || mc_die "Deep Sync is production-only. Staging should keep OUTREACH_CRM_DEEP_SYNC_ENABLED=false."

command -v gcloud >/dev/null 2>&1 || mc_die "gcloud not installed"

case "$GATEWAY_URL" in
  https://* | http://localhost:* | http://127.0.0.1:*)
    ;;
  *)
    mc_die "GATEWAY_URL must be https://... for Cloud Run, or localhost only for local testing"
    ;;
esac

if [[ "$GATEWAY_URL" == http://localhost:* || "$GATEWAY_URL" == http://127.0.0.1:* ]]; then
  mc_warn "localhost gateway URLs do not work from Cloud Run. Use only for local/dev testing."
fi

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud config set run/region "$REGION" >/dev/null

upsert_secret() {
  local name="$1"
  local value="$2"
  if ! gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets create "$name" \
      --project="$PROJECT_ID" \
      --replication-policy=automatic \
      --data-file=- >/dev/null
  else
    printf '%s' "$value" | gcloud secrets versions add "$name" \
      --project="$PROJECT_ID" \
      --data-file=- >/dev/null
  fi
}

upsert_secret "$MC_OUTREACH_OPENCLAW_GATEWAY_URL_SECRET" "$GATEWAY_URL"
if [ -n "$WEBHOOK_URL" ]; then
  upsert_secret "$MC_OUTREACH_OPENCLAW_WEBHOOK_URL_SECRET" "$WEBHOOK_URL"
fi

WEB_URL="$(gcloud run services describe "$MC_WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)' 2>/dev/null || true)"
[ -n "$WEB_URL" ] || mc_die "could not find Cloud Run service $MC_WEB_SERVICE in $REGION"

gcloud run services update "$MC_WEB_SERVICE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --update-env-vars "OUTREACH_CRM_DEEP_SYNC_ENABLED=true,OUTREACH_CRM_OPENCLAW_TRANSPORT=gateway,OUTREACH_CRM_OPENCLAW_AGENT_ID=sasha-outreach,OUTREACH_CRM_CALLBACK_URL=$WEB_URL/api/outreach-crm/v1/openclaw/callback" \
  --update-secrets "OUTREACH_CRM_OPENCLAW_GATEWAY_URL=$MC_OUTREACH_OPENCLAW_GATEWAY_URL_SECRET:latest,OUTREACH_CRM_WEBHOOK_SECRET=$MC_OUTREACH_WEBHOOK_SECRET_SECRET:latest,OUTREACH_CRM_SERVICE_TOKEN=$MC_OUTREACH_SERVICE_TOKEN_SECRET:latest" \
  --no-invoker-iam-check >/dev/null

cat <<EOF

================================================================
Outreach OpenClaw gateway configured for $MC_ENV_LABEL.

Mission Control: $WEB_URL
Gateway secret: $MC_OUTREACH_OPENCLAW_GATEWAY_URL_SECRET
Transport:      gateway
Agent id:       sasha-outreach
Callback URL:   $WEB_URL/api/outreach-crm/v1/openclaw/callback

OpenClaw must use the same HMAC secret stored in:
  $MC_OUTREACH_WEBHOOK_SECRET_SECRET

To copy it onto the OpenClaw host:
  gcloud secrets versions access latest --secret=$MC_OUTREACH_WEBHOOK_SECRET_SECRET --project=$PROJECT_ID
================================================================
EOF
