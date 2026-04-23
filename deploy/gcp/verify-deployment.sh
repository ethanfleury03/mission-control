#!/usr/bin/env bash
# After bootstrap (or partial deploy), verify Mission Control on GCP.
# Usage: bash deploy/gcp/verify-deployment.sh PROJECT_ID [REGION] [CUSTOM_DOMAIN]
set -euo pipefail
PROJECT_ID="${1:?PROJECT_ID required}"
REGION="${2:-us-central1}"
CUSTOM_DOMAIN="${3:-${MISSION_CONTROL_DOMAIN:-support.arrsys.com}}"

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

DOMAIN_SLUG="$(slugify "$CUSTOM_DOMAIN")"
NAME_PREFIX="$(printf 'mc-web-%s' "$DOMAIN_SLUG" | cut -c1-40)"
ADDRESS_NAME="${NAME_PREFIX}-ip"
CERT_NAME="${NAME_PREFIX}-cert"

echo "=== Project: $PROJECT_ID  Region: $REGION  Domain: $CUSTOM_DOMAIN ==="
gcloud config set project "$PROJECT_ID" >/dev/null

echo "=== Cloud Run: mc-web ==="
if gcloud run services describe mc-web --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  WEB_URL="$(gcloud run services describe mc-web --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
  echo "WEB_URL=$WEB_URL"
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_URL/api/healthz" || echo 000)"
  echo "GET /api/healthz -> HTTP $code (expect 200)"
  WEB_SERVICE_JSON="$(gcloud run services describe mc-web --region="$REGION" --project="$PROJECT_ID" --format=json)"
  NEXTAUTH_URL="$(python3 -c 'import json,sys; data=json.load(sys.stdin); envs=data.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [{}])[0].get("env", []); print(next((env.get("value", "") for env in envs if env.get("name") == "NEXTAUTH_URL"), ""))' <<<"$WEB_SERVICE_JSON")"
  echo "NEXTAUTH_URL=${NEXTAUTH_URL:-"(unset)"}"
  echo ""
  echo "OAuth redirect URIs to keep configured:"
  echo "  ${WEB_URL}/api/auth/callback/google"
  echo "  https://${CUSTOM_DOMAIN}/api/auth/callback/google"
else
  echo "mc-web: NOT FOUND (run bootstrap or cloudbuild.web.yaml first)"
fi

echo ""
echo "=== Cloud Run: mc-api ==="
if gcloud run services describe mc-api --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  API_URL="$(gcloud run services describe mc-api --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
  echo "API_URL=$API_URL"
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$API_URL/health/live" || echo 000)"
  echo "GET /health/live (no auth) -> HTTP $code (expect 401 or 403)"
else
  echo "mc-api: NOT FOUND"
fi

echo ""
echo "=== Cloud Run Job: mc-scraper ==="
gcloud run jobs list --region="$REGION" --project="$PROJECT_ID" --format='table(name)' 2>/dev/null || true

echo ""
echo "=== Cloud Scheduler (mc-scraper-tick) ==="
gcloud scheduler jobs list --location="$REGION" --project="$PROJECT_ID" --format='table(name,state)' 2>/dev/null | grep -i scraper || echo "(none or API disabled)"

echo ""
echo "=== Custom Domain Edge ==="
if gcloud compute addresses describe "$ADDRESS_NAME" --global --project="$PROJECT_ID" &>/dev/null; then
  EDGE_IP="$(gcloud compute addresses describe "$ADDRESS_NAME" --global --project="$PROJECT_ID" --format='value(address)')"
  echo "EDGE_IP=$EDGE_IP"
else
  echo "EDGE_IP=(not provisioned)"
fi

if gcloud certificate-manager certificates describe "$CERT_NAME" --location=global --project="$PROJECT_ID" &>/dev/null; then
  CERT_STATE="$(gcloud certificate-manager certificates describe "$CERT_NAME" --location=global --project="$PROJECT_ID" --format='value(managed.state)')"
  echo "CERT_STATE=$CERT_STATE"
else
  echo "CERT_STATE=(not provisioned)"
fi

if command -v dig >/dev/null 2>&1; then
  echo "CURRENT_DNS:"
  dig +nocmd "$CUSTOM_DOMAIN" +noall +answer 2>/dev/null || echo "(no public answer)"
fi

CUSTOM_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "https://${CUSTOM_DOMAIN}/api/healthz" || echo 000)"
echo "GET https://${CUSTOM_DOMAIN}/api/healthz -> HTTP $CUSTOM_CODE (expect 200 after cutover)"

echo ""
echo "=== Done ==="
