#!/usr/bin/env bash
# Upload the reconciled Sasha outreach state snapshot used by prod Deep Sync.
#
# Usage:
#   bash deploy/gcp/upload-prod-outreach-state.sh <PROJECT_ID> [STATE_PATH] [REGION]

set -euo pipefail

PROJECT_ID="${1:?PROJECT_ID required}"
STATE_PATH="${2:-/Users/sasha/.openclaw/workspace/scripts/sasha_outreach/state.json}"
REGION="${3:-us-central1}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-config.sh"

mc_resolve_env prod
mc_validate_project_id "$PROJECT_ID"

command -v gcloud >/dev/null 2>&1 || mc_die "gcloud not installed"
[ -f "$STATE_PATH" ] || mc_die "state file not found: $STATE_PATH"

gcloud config set project "$PROJECT_ID" >/dev/null

STATE_BUCKET="${MC_OUTREACH_STATE_BUCKET:-${PROJECT_ID}-sasha-outreach-state}"
STATE_OBJECT="prod/state.json"

if ! gcloud storage buckets describe "gs://$STATE_BUCKET" --project="$PROJECT_ID" >/dev/null 2>&1; then
  mc_info "Creating prod Outreach state bucket gs://$STATE_BUCKET"
  gcloud storage buckets create "gs://$STATE_BUCKET" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access >/dev/null
fi

python3 -m json.tool "$STATE_PATH" >/dev/null

gcloud storage cp "$STATE_PATH" "gs://$STATE_BUCKET/$STATE_OBJECT" --project="$PROJECT_ID" >/dev/null

cat <<EOF
Uploaded Outreach state snapshot:
  $STATE_PATH
to:
  gs://$STATE_BUCKET/$STATE_OBJECT
EOF
