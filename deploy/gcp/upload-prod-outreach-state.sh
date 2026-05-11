#!/usr/bin/env bash
# Upload the reconciled multi-agent outreach state snapshots used by prod Deep Sync.
#
# Usage:
#   bash deploy/gcp/upload-prod-outreach-state.sh <PROJECT_ID> [OUTREACH_DIR_OR_STATE_PATH] [REGION]

set -euo pipefail

PROJECT_ID="${1:?PROJECT_ID required}"
STATE_ARG="${2:-/Users/sasha/.openclaw/workspace/scripts/sasha_outreach}"
REGION="${3:-us-central1}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-config.sh"

mc_resolve_env prod
mc_validate_project_id "$PROJECT_ID"

command -v gcloud >/dev/null 2>&1 || mc_die "gcloud not installed"
if [ -d "$STATE_ARG" ]; then
  OUTREACH_DIR="$STATE_ARG"
  STATE_PATH="$OUTREACH_DIR/state.json"
else
  STATE_PATH="$STATE_ARG"
  OUTREACH_DIR="$(cd "$(dirname "$STATE_PATH")" && pwd)"
fi
[ -f "$STATE_PATH" ] || mc_die "state file not found: $STATE_PATH"

gcloud config set project "$PROJECT_ID" >/dev/null

STATE_BUCKET="${MC_OUTREACH_STATE_BUCKET:-${PROJECT_ID}-sasha-outreach-state}"
STATE_PREFIX="prod"
STATE_OBJECT="$STATE_PREFIX/state.json"

if ! gcloud storage buckets describe "gs://$STATE_BUCKET" --project="$PROJECT_ID" >/dev/null 2>&1; then
  mc_info "Creating prod Outreach state bucket gs://$STATE_BUCKET"
  gcloud storage buckets create "gs://$STATE_BUCKET" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access >/dev/null
fi

upload_json() {
  local src="$1"
  local dest="$2"
  [ -f "$src" ] || mc_die "required state file not found: $src"
  python3 -m json.tool "$src" >/dev/null
  gcloud storage cp "$src" "gs://$STATE_BUCKET/$dest" --project="$PROJECT_ID" >/dev/null
}

upload_json "$STATE_PATH" "$STATE_OBJECT"
[ -f "$OUTREACH_DIR/agents.json" ] && upload_json "$OUTREACH_DIR/agents.json" "$STATE_PREFIX/agents.json"
for AGENT in mark aaron jordan; do
  upload_json "$OUTREACH_DIR/agents/$AGENT/state.json" "$STATE_PREFIX/agents/$AGENT/state.json"
done

cat <<EOF
Uploaded Outreach state snapshots:
  Sasha:  $STATE_PATH
  Mark:   $OUTREACH_DIR/agents/mark/state.json
  Aaron:  $OUTREACH_DIR/agents/aaron/state.json
  Jordan: $OUTREACH_DIR/agents/jordan/state.json
to:
  gs://$STATE_BUCKET/$STATE_PREFIX/
EOF
