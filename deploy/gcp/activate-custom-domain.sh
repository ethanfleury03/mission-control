#!/usr/bin/env bash
# Switch mc-web from the run.app URL to the custom domain after DNS cutover.
# Usage: bash deploy/gcp/activate-custom-domain.sh PROJECT_ID [REGION] [CUSTOM_DOMAIN] [WEB_SERVICE]
set -euo pipefail

PROJECT_ID="${1:?PROJECT_ID required}"
REGION="${2:-us-central1}"
CUSTOM_DOMAIN="${3:-${MISSION_CONTROL_DOMAIN:-support.arrsys.com}}"
WEB_SERVICE="${4:-mc-web}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mFATAL:\033[0m %s\n' "$*" >&2; exit 1; }

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

DOMAIN_SLUG="$(slugify "$CUSTOM_DOMAIN")"
NAME_PREFIX="$(printf 'mc-web-%s' "$DOMAIN_SLUG" | cut -c1-40)"
ADDRESS_NAME="${NAME_PREFIX}-ip"
CERT_NAME="${NAME_PREFIX}-cert"

command -v gcloud >/dev/null 2>&1 || die "gcloud not installed"
gcloud config set project "$PROJECT_ID" >/dev/null

WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)' 2>/dev/null || true)"
[[ -n "$WEB_URL" ]] || die "Cloud Run service '$WEB_SERVICE' not found"

EDGE_IP="$(gcloud compute addresses describe "$ADDRESS_NAME" --global --format='value(address)' 2>/dev/null || true)"
[[ -n "$EDGE_IP" ]] || die "Edge IP '${ADDRESS_NAME}' not found. Run provision-edge.sh first."

CERT_STATE="$(gcloud certificate-manager certificates describe "$CERT_NAME" --location=global --format='value(managed.state)' 2>/dev/null || true)"
if [[ "$CERT_STATE" != "ACTIVE" ]]; then
  die "Certificate '${CERT_NAME}' is not ACTIVE yet (state=${CERT_STATE:-UNKNOWN}). Finish DNS authorization first."
fi

info "Checking live custom-domain health"
LIVE_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "https://${CUSTOM_DOMAIN}/api/healthz" || echo 000)"
if [[ "$LIVE_CODE" != "200" ]]; then
  warn "Live DNS check returned HTTP ${LIVE_CODE}"
  RESOLVE_CODE="$(curl -sS --resolve "${CUSTOM_DOMAIN}:443:${EDGE_IP}" -o /dev/null -w '%{http_code}' "https://${CUSTOM_DOMAIN}/api/healthz" || echo 000)"
  if [[ "$RESOLVE_CODE" == "200" ]]; then
    die "The edge is healthy, but public DNS for ${CUSTOM_DOMAIN} has not fully cut over to ${EDGE_IP} yet."
  fi
  die "Custom domain health check failed even when targeting the edge."
fi

info "Updating NEXTAUTH_URL on ${WEB_SERVICE}"
gcloud run services update "$WEB_SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars "NEXTAUTH_URL=https://${CUSTOM_DOMAIN}" >/dev/null

if [[ -f "$(dirname "$0")/provision-monitoring.sh" ]]; then
  info "Provisioning post-cutover monitoring"
  if ! bash "$(dirname "$0")/provision-monitoring.sh" "$PROJECT_ID" "$REGION" "$CUSTOM_DOMAIN"; then
    warn "Monitoring provisioning failed. The custom domain is active, but monitoring needs attention."
  fi
fi

echo
echo "================================================================"
echo "Custom domain is active for ${WEB_SERVICE}"
echo "Run.app URL:         ${WEB_URL}"
echo "Custom domain:       https://${CUSTOM_DOMAIN}"
echo "Required OAuth callbacks to keep configured:"
echo "  ${WEB_URL}/api/auth/callback/google"
echo "  https://${CUSTOM_DOMAIN}/api/auth/callback/google"
echo "================================================================"
