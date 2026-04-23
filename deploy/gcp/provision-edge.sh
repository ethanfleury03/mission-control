#!/usr/bin/env bash
# Provision a global external Application Load Balancer for mc-web.
# Usage: bash deploy/gcp/provision-edge.sh PROJECT_ID [REGION] [CUSTOM_DOMAIN] [WEB_SERVICE]
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
NEG_NAME="${NAME_PREFIX}-neg"
BACKEND_SERVICE="${NAME_PREFIX}-backend"
HTTPS_URL_MAP="${NAME_PREFIX}-https-map"
HTTP_REDIRECT_URL_MAP="${NAME_PREFIX}-http-redirect"
HTTPS_PROXY="${NAME_PREFIX}-https-proxy"
HTTP_PROXY="${NAME_PREFIX}-http-proxy"
HTTPS_FORWARDING_RULE="${NAME_PREFIX}-https-fr"
HTTP_FORWARDING_RULE="${NAME_PREFIX}-http-fr"
DNS_AUTH="${NAME_PREFIX}-dns-auth"
CERT_NAME="${NAME_PREFIX}-cert"
CERT_PATH="projects/${PROJECT_ID}/locations/global/certificates/${CERT_NAME}"

command -v gcloud >/dev/null 2>&1 || die "gcloud not installed"
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable compute.googleapis.com certificatemanager.googleapis.com run.googleapis.com >/dev/null

if ! gcloud run services describe "$WEB_SERVICE" --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1; then
  die "Cloud Run service '$WEB_SERVICE' not found in project '$PROJECT_ID' region '$REGION'"
fi

WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"

info "Current DNS inventory for ${CUSTOM_DOMAIN}"
if command -v dig >/dev/null 2>&1; then
  CURRENT_DNS="$(dig +nocmd "$CUSTOM_DOMAIN" +noall +answer 2>/dev/null || true)"
  if [[ -n "$CURRENT_DNS" ]]; then
    printf '%s\n' "$CURRENT_DNS"
  else
    warn "No current public DNS answer found for ${CUSTOM_DOMAIN}"
  fi
else
  warn "'dig' not installed; skipping DNS inventory"
fi

info "Ensuring global IP address ${ADDRESS_NAME}"
if ! gcloud compute addresses describe "$ADDRESS_NAME" --global >/dev/null 2>&1; then
  gcloud compute addresses create "$ADDRESS_NAME" --global --ip-version=IPV4 >/dev/null
fi
EDGE_IP="$(gcloud compute addresses describe "$ADDRESS_NAME" --global --format='value(address)')"

info "Ensuring serverless NEG ${NEG_NAME}"
if ! gcloud compute network-endpoint-groups describe "$NEG_NAME" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute network-endpoint-groups create "$NEG_NAME" \
    --region="$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$WEB_SERVICE" >/dev/null
fi

info "Ensuring backend service ${BACKEND_SERVICE}"
if ! gcloud compute backend-services describe "$BACKEND_SERVICE" --global >/dev/null 2>&1; then
  gcloud compute backend-services create "$BACKEND_SERVICE" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --protocol=HTTP \
    --port-name=http \
    --timeout=30s \
    --enable-logging \
    --logging-sample-rate=1 >/dev/null
fi

BACKEND_JSON="$(gcloud compute backend-services describe "$BACKEND_SERVICE" --global --format=json)"
if ! python3 -c 'import json, sys; neg_name = sys.argv[1]; data = json.load(sys.stdin); raise SystemExit(0 if any(str(backend.get("group", "")).endswith(f"/networkEndpointGroups/{neg_name}") for backend in data.get("backends", [])) else 1)' "$NEG_NAME" <<<"$BACKEND_JSON"
then
  gcloud compute backend-services add-backend "$BACKEND_SERVICE" \
    --global \
    --network-endpoint-group="$NEG_NAME" \
    --network-endpoint-group-region="$REGION" >/dev/null
fi

info "Ensuring HTTPS URL map ${HTTPS_URL_MAP}"
if ! gcloud compute url-maps describe "$HTTPS_URL_MAP" --global >/dev/null 2>&1; then
  gcloud compute url-maps create "$HTTPS_URL_MAP" --global --default-service="$BACKEND_SERVICE" >/dev/null
else
  gcloud compute url-maps set-default-service "$HTTPS_URL_MAP" --global --default-service="$BACKEND_SERVICE" >/dev/null
fi

info "Ensuring DNS authorization ${DNS_AUTH}"
if ! gcloud certificate-manager dns-authorizations describe "$DNS_AUTH" --location=global >/dev/null 2>&1; then
  gcloud certificate-manager dns-authorizations create "$DNS_AUTH" \
    --location=global \
    --domain="$CUSTOM_DOMAIN" \
    --type=fixed-record >/dev/null
fi

DNS_RECORD_NAME="$(gcloud certificate-manager dns-authorizations describe "$DNS_AUTH" --location=global --format='value(dnsResourceRecord.name)')"
DNS_RECORD_TYPE="$(gcloud certificate-manager dns-authorizations describe "$DNS_AUTH" --location=global --format='value(dnsResourceRecord.type)')"
DNS_RECORD_DATA="$(gcloud certificate-manager dns-authorizations describe "$DNS_AUTH" --location=global --format='value(dnsResourceRecord.data)')"

info "Ensuring managed certificate ${CERT_NAME}"
if ! gcloud certificate-manager certificates describe "$CERT_NAME" --location=global >/dev/null 2>&1; then
  gcloud certificate-manager certificates create "$CERT_NAME" \
    --location=global \
    --domains="$CUSTOM_DOMAIN" \
    --dns-authorizations="$DNS_AUTH" >/dev/null
fi
CERT_STATE="$(gcloud certificate-manager certificates describe "$CERT_NAME" --location=global --format='value(managed.state)')"

info "Ensuring HTTPS proxy ${HTTPS_PROXY}"
if ! gcloud compute target-https-proxies describe "$HTTPS_PROXY" --global >/dev/null 2>&1; then
  gcloud compute target-https-proxies create "$HTTPS_PROXY" \
    --global \
    --url-map="$HTTPS_URL_MAP" \
    --certificate-manager-certificates="$CERT_PATH" >/dev/null
else
  gcloud compute target-https-proxies update "$HTTPS_PROXY" \
    --global \
    --url-map="$HTTPS_URL_MAP" \
    --certificate-manager-certificates="$CERT_PATH" >/dev/null
fi

info "Ensuring HTTP redirect URL map ${HTTP_REDIRECT_URL_MAP}"
TMP_URLMAP="$(mktemp "${TMPDIR:-/tmp}/mc-http-redirect.XXXXXX.yaml")"
cat >"$TMP_URLMAP" <<EOF
name: ${HTTP_REDIRECT_URL_MAP}
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
  stripQuery: false
EOF
gcloud compute url-maps import "$HTTP_REDIRECT_URL_MAP" --global --source="$TMP_URLMAP" --quiet >/dev/null
rm -f "$TMP_URLMAP"

info "Ensuring HTTP proxy ${HTTP_PROXY}"
if ! gcloud compute target-http-proxies describe "$HTTP_PROXY" --global >/dev/null 2>&1; then
  gcloud compute target-http-proxies create "$HTTP_PROXY" --global --url-map="$HTTP_REDIRECT_URL_MAP" >/dev/null
else
  gcloud compute target-http-proxies update "$HTTP_PROXY" --global --url-map="$HTTP_REDIRECT_URL_MAP" >/dev/null
fi

info "Ensuring forwarding rules"
if ! gcloud compute forwarding-rules describe "$HTTPS_FORWARDING_RULE" --global >/dev/null 2>&1; then
  gcloud compute forwarding-rules create "$HTTPS_FORWARDING_RULE" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --address="$ADDRESS_NAME" \
    --target-https-proxy="$HTTPS_PROXY" \
    --global-target-https-proxy \
    --ports=443 >/dev/null
fi

if ! gcloud compute forwarding-rules describe "$HTTP_FORWARDING_RULE" --global >/dev/null 2>&1; then
  gcloud compute forwarding-rules create "$HTTP_FORWARDING_RULE" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --address="$ADDRESS_NAME" \
    --target-http-proxy="$HTTP_PROXY" \
    --global-target-http-proxy \
    --ports=80 >/dev/null
fi

PRECUTOVER_CODE="pending"
if [[ "$CERT_STATE" == "ACTIVE" ]]; then
  PRECUTOVER_CODE="$(curl -sS --resolve "${CUSTOM_DOMAIN}:443:${EDGE_IP}" -o /dev/null -w '%{http_code}' "https://${CUSTOM_DOMAIN}/api/healthz" || echo 000)"
fi

echo
echo "================================================================"
echo "Custom domain edge prepared for ${CUSTOM_DOMAIN}"
echo "Cloud Run service: ${WEB_SERVICE}"
echo "Cloud Run URL:     ${WEB_URL}"
echo "Frontend IP:       ${EDGE_IP}"
echo "Cert state:        ${CERT_STATE:-UNKNOWN}"
echo
echo "DNS authorization record (required for Certificate Manager):"
echo "  ${DNS_RECORD_NAME} ${DNS_RECORD_TYPE} ${DNS_RECORD_DATA}"
echo
echo "Public DNS cutover target:"
echo "  ${CUSTOM_DOMAIN} A ${EDGE_IP}"
echo
echo "OAuth callback URI to add now:"
echo "  https://${CUSTOM_DOMAIN}/api/auth/callback/google"
echo
if [[ "$CERT_STATE" == "ACTIVE" ]]; then
  echo "Pre-cutover health check via --resolve:"
  echo "  https://${CUSTOM_DOMAIN}/api/healthz -> HTTP ${PRECUTOVER_CODE}"
else
  echo "Certificate is not ACTIVE yet."
  echo "After adding the DNS authorization record, re-run this script until the cert is ACTIVE."
fi
echo "================================================================"
