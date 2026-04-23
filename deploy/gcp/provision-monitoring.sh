#!/usr/bin/env bash
# Provision minimal post-cutover monitoring for Mission Control.
# Usage: bash deploy/gcp/provision-monitoring.sh PROJECT_ID [REGION] [CUSTOM_DOMAIN] [WEB_SERVICE] [API_SERVICE]
set -euo pipefail

PROJECT_ID="${1:?PROJECT_ID required}"
REGION="${2:-us-central1}"
CUSTOM_DOMAIN="${3:-${MISSION_CONTROL_DOMAIN:-support.arrsys.com}}"
WEB_SERVICE="${4:-mc-web}"
API_SERVICE="${5:-mc-api}"
NOTIFICATION_CHANNELS_RAW="${MISSION_CONTROL_NOTIFICATION_CHANNELS:-}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mFATAL:\033[0m %s\n' "$*" >&2; exit 1; }

command -v gcloud >/dev/null 2>&1 || die "gcloud not installed"
command -v python3 >/dev/null 2>&1 || die "python3 required"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable monitoring.googleapis.com >/dev/null

UPTIME_DISPLAY="Mission Control ${CUSTOM_DOMAIN} /api/healthz"
UPTIME_POLICY_DISPLAY="Mission Control ${CUSTOM_DOMAIN} uptime"
WEB_5XX_POLICY_DISPLAY="Mission Control ${WEB_SERVICE} repeated 5xx"
API_HEALTH_POLICY_DISPLAY="Mission Control ${API_SERVICE} unhealthy"

find_uptime_id() {
  local DISPLAY_NAME="$1"
  local CONFIGS_JSON
  CONFIGS_JSON="$(gcloud monitoring uptime list-configs --project="$PROJECT_ID" --format=json)"
  python3 -c 'import json, sys; display = sys.argv[1]; items = json.load(sys.stdin); print(next((str(item.get("name", "")).split("/")[-1] for item in items if item.get("displayName") == display), ""))' "$DISPLAY_NAME" <<<"$CONFIGS_JSON"
}

find_policy_name() {
  local DISPLAY_NAME="$1"
  local POLICIES_JSON
  POLICIES_JSON="$(gcloud monitoring policies list --project="$PROJECT_ID" --format=json)"
  python3 -c 'import json, sys; display = sys.argv[1]; items = json.load(sys.stdin); print(next((item.get("name", "") for item in items if item.get("displayName") == display), ""))' "$DISPLAY_NAME" <<<"$POLICIES_JSON"
}

delete_policy_if_present() {
  local DISPLAY_NAME="$1"
  local POLICY_NAME
  POLICY_NAME="$(find_policy_name "$DISPLAY_NAME")"
  if [[ -n "$POLICY_NAME" ]]; then
    gcloud monitoring policies delete "$POLICY_NAME" --project="$PROJECT_ID" --quiet >/dev/null
  fi
}

UPTIME_ID="$(find_uptime_id "$UPTIME_DISPLAY")"
if [[ -n "$UPTIME_ID" ]]; then
  info "Replacing uptime check ${UPTIME_DISPLAY}"
  gcloud monitoring uptime delete "$UPTIME_ID" --project="$PROJECT_ID" --quiet >/dev/null
fi

delete_policy_if_present "$UPTIME_POLICY_DISPLAY"
delete_policy_if_present "$WEB_5XX_POLICY_DISPLAY"
delete_policy_if_present "$API_HEALTH_POLICY_DISPLAY"

info "Creating uptime check for https://${CUSTOM_DOMAIN}/api/healthz"
gcloud monitoring uptime create "$UPTIME_DISPLAY" \
  --project="$PROJECT_ID" \
  --resource-type=uptime-url \
  --resource-labels="host=${CUSTOM_DOMAIN},project_id=${PROJECT_ID}" \
  --protocol=https \
  --path=/api/healthz \
  --request-method=get \
  --period=300s \
  --timeout=10s \
  --validate-ssl=true >/dev/null

UPTIME_ID="$(find_uptime_id "$UPTIME_DISPLAY")"
[[ -n "$UPTIME_ID" ]] || die "Failed to resolve uptime check ID after creation"

info "Creating alert policies"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mc-monitoring.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

python3 - "$TMP_DIR/uptime.json" "$UPTIME_POLICY_DISPLAY" "$UPTIME_ID" "$CUSTOM_DOMAIN" "$NOTIFICATION_CHANNELS_RAW" <<'PY'
import json, sys
path, display, check_id, domain, channels_raw = sys.argv[1:]
channels = [c.strip() for c in channels_raw.split(",") if c.strip()]
policy = {
    "displayName": display,
    "combiner": "OR",
    "enabled": True,
    "documentation": {
        "content": f"Public Mission Control health check failed for https://{domain}/api/healthz.",
        "mimeType": "text/markdown",
    },
    "conditions": [
        {
            "displayName": f"{domain} uptime failed",
            "conditionThreshold": {
                "filter": (
                    'metric.type="monitoring.googleapis.com/uptime_check/check_passed" '
                    'AND resource.type="uptime_url" '
                    f'AND metric.label."check_id"="{check_id}"'
                ),
                "comparison": "COMPARISON_LT",
                "thresholdValue": 1,
                "duration": "300s",
                "aggregations": [
                    {
                        "alignmentPeriod": "300s",
                        "perSeriesAligner": "ALIGN_NEXT_OLDER",
                    }
                ],
                "trigger": {"count": 1},
            },
        }
    ],
}
if channels:
    policy["notificationChannels"] = channels
with open(path, "w", encoding="utf-8") as fh:
    json.dump(policy, fh)
PY

python3 - "$TMP_DIR/web-5xx.json" "$WEB_5XX_POLICY_DISPLAY" "$WEB_SERVICE" "$NOTIFICATION_CHANNELS_RAW" <<'PY'
import json, sys
path, display, service, channels_raw = sys.argv[1:]
channels = [c.strip() for c in channels_raw.split(",") if c.strip()]
policy = {
    "displayName": display,
    "combiner": "OR",
    "enabled": True,
    "documentation": {
        "content": f"Cloud Run service `{service}` is returning repeated 5xx responses.",
        "mimeType": "text/markdown",
    },
    "conditions": [
        {
            "displayName": f"{service} 5xx requests > 5 in 5m",
            "conditionThreshold": {
                "filter": (
                    'metric.type="run.googleapis.com/request_count" '
                    'AND resource.type="cloud_run_revision" '
                    f'AND resource.label."service_name"="{service}" '
                    'AND metric.label."response_code_class"="5xx"'
                ),
                "comparison": "COMPARISON_GT",
                "thresholdValue": 5,
                "duration": "300s",
                "aggregations": [
                    {
                        "alignmentPeriod": "300s",
                        "perSeriesAligner": "ALIGN_SUM",
                        "crossSeriesReducer": "REDUCE_SUM",
                    }
                ],
                "trigger": {"count": 1},
            },
        }
    ],
}
if channels:
    policy["notificationChannels"] = channels
with open(path, "w", encoding="utf-8") as fh:
    json.dump(policy, fh)
PY

python3 - "$TMP_DIR/api-health.json" "$API_HEALTH_POLICY_DISPLAY" "$API_SERVICE" "$NOTIFICATION_CHANNELS_RAW" <<'PY'
import json, sys
path, display, service, channels_raw = sys.argv[1:]
channels = [c.strip() for c in channels_raw.split(",") if c.strip()]
policy = {
    "displayName": display,
    "combiner": "OR",
    "enabled": True,
    "documentation": {
        "content": f"Cloud Run service `{service}` is reporting unhealthy instances.",
        "mimeType": "text/markdown",
    },
    "conditions": [
        {
            "displayName": f"{service} unhealthy instances present",
            "conditionThreshold": {
                "filter": (
                    'metric.type="run.googleapis.com/service_health_count" '
                    'AND resource.type="cloud_run_revision" '
                    f'AND resource.label."service_name"="{service}" '
                    'AND metric.label."service_health"="UNHEALTHY"'
                ),
                "comparison": "COMPARISON_GT",
                "thresholdValue": 0,
                "duration": "300s",
                "aggregations": [
                    {
                        "alignmentPeriod": "300s",
                        "perSeriesAligner": "ALIGN_MAX",
                        "crossSeriesReducer": "REDUCE_SUM",
                    }
                ],
                "trigger": {"count": 1},
            },
        }
    ],
}
if channels:
    policy["notificationChannels"] = channels
with open(path, "w", encoding="utf-8") as fh:
    json.dump(policy, fh)
PY

gcloud monitoring policies create --project="$PROJECT_ID" --policy-from-file="$TMP_DIR/uptime.json" >/dev/null
gcloud monitoring policies create --project="$PROJECT_ID" --policy-from-file="$TMP_DIR/web-5xx.json" >/dev/null
gcloud monitoring policies create --project="$PROJECT_ID" --policy-from-file="$TMP_DIR/api-health.json" >/dev/null

echo
echo "================================================================"
echo "Monitoring configured"
echo "Uptime check:   ${UPTIME_DISPLAY}"
echo "Alert policy:   ${UPTIME_POLICY_DISPLAY}"
echo "Alert policy:   ${WEB_5XX_POLICY_DISPLAY}"
echo "Alert policy:   ${API_HEALTH_POLICY_DISPLAY}"
if [[ -z "$NOTIFICATION_CHANNELS_RAW" ]]; then
  echo "Notification channels were not provided. Policies were created without explicit channels."
fi
echo "================================================================"
