#!/usr/bin/env bash
# After bootstrap (or partial deploy), verify Mission Control on GCP.
# Usage: bash deploy/gcp/verify-deployment.sh PROJECT_ID [REGION]
set -euo pipefail
PROJECT_ID="${1:?PROJECT_ID required}"
REGION="${2:-us-central1}"

echo "=== Project: $PROJECT_ID  Region: $REGION ==="
gcloud config set project "$PROJECT_ID" >/dev/null

echo "=== Cloud Run: mc-web ==="
if gcloud run services describe mc-web --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  WEB_URL="$(gcloud run services describe mc-web --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
  echo "WEB_URL=$WEB_URL"
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_URL/api/healthz" || echo 000)"
  echo "GET /api/healthz -> HTTP $code (expect 200)"
  echo ""
  echo "OAuth (manual): add this Authorized redirect URI in Google Cloud Console -> APIs & Credentials -> your Web client:"
  echo "  ${WEB_URL}/api/auth/callback/google"
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
echo "=== Done ==="
