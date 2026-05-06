#!/usr/bin/env bash
# Refresh Sasha outreach state locally, upload it for prod Deep Sync, then ask
# Mission Control to ingest the fresh snapshot.
#
# This script is intentionally prod-only. It uses local read-only Gmail
# reconciliation helpers from OpenClaw, uploads state.json to GCS, and triggers
# the existing Mission Control deep_sync action.
#
# Usage:
#   bash deploy/gcp/refresh-prod-outreach-state.sh <PROJECT_ID> [REGION]

set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${2:-us-central1}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

OUTREACH_WORKSPACE="${SASHA_OUTREACH_WORKSPACE:-/Users/sasha/.openclaw/workspace}"
OUTREACH_DIR="${SASHA_OUTREACH_DIR:-$OUTREACH_WORKSPACE/scripts/sasha_outreach}"
STATE_PATH="${SASHA_OUTREACH_STATE_PATH:-$OUTREACH_DIR/state.json}"
LOCK_PATH="${OUTREACH_REFRESH_LOCK_PATH:-/tmp/arrsys-outreach-state-refresh.lockdir}"
LOG_PREFIX="[outreach-state-refresh]"

WEB_URL="${MC_OUTREACH_PROD_WEB_URL:-https://hub.arrsys.com}"
TRIGGER_DEEP_SYNC="${TRIGGER_DEEP_SYNC:-1}"
RUN_LOCAL_RECONCILE="${RUN_LOCAL_RECONCILE:-1}"
SERVICE_TOKEN_SECRET="${OUTREACH_CRM_SERVICE_TOKEN_SECRET:-mc-outreach-crm-service-token}"

die() {
  echo "$LOG_PREFIX FATAL: $*" >&2
  exit 1
}

info() {
  echo "$LOG_PREFIX $*"
}

warn() {
  echo "$LOG_PREFIX WARN: $*" >&2
}

[ -n "$PROJECT_ID" ] || die "PROJECT_ID required"
[ -d "$OUTREACH_DIR" ] || die "OpenClaw outreach dir not found: $OUTREACH_DIR"
[ -f "$STATE_PATH" ] || die "state file not found: $STATE_PATH"
command -v python3 >/dev/null 2>&1 || die "python3 not found"
command -v gcloud >/dev/null 2>&1 || die "gcloud not found"

if ! mkdir "$LOCK_PATH" 2>/dev/null; then
  info "another refresh is already running; exiting"
  exit 0
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rmdir "$LOCK_PATH" 2>/dev/null || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

STATE_BACKUP="$TMP_DIR/state.before.json"
cp "$STATE_PATH" "$STATE_BACKUP"

run_optional_python() {
  local script="$1"
  local output="$2"
  if [ ! -f "$OUTREACH_DIR/$script" ]; then
    warn "skipping missing $script"
    return 0
  fi
  info "running $script"
  if ! (cd "$OUTREACH_WORKSPACE" && python3 "$OUTREACH_DIR/$script") >"$output" 2>"$output.err"; then
    warn "$script failed; leaving existing state changes intact for other steps"
    sed -n '1,80p' "$output.err" >&2 || true
    return 0
  fi
  sed -n '1,40p' "$output" || true
}

apply_reply_monitor_output() {
  local monitor_json="$1"
  [ -s "$monitor_json" ] || return 0

  STATE_PATH="$STATE_PATH" MONITOR_JSON="$monitor_json" python3 <<'PY'
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

state_path = Path(os.environ["STATE_PATH"])
monitor_path = Path(os.environ["MONITOR_JSON"])

try:
    payload = json.loads(monitor_path.read_text(encoding="utf-8"))
except Exception as exc:
    print(json.dumps({"appliedReplies": 0, "error": f"invalid reply monitor JSON: {exc}"}))
    raise SystemExit(0)

state = json.loads(state_path.read_text(encoding="utf-8"))
contacts = state.setdefault("contacts", {})
threads = state.setdefault("threads", {})

def iso_from_row(row: dict) -> str:
    value = row.get("iso")
    if value:
        return str(value)
    internal = row.get("internalDate")
    try:
        return datetime.fromtimestamp(int(internal) / 1000, timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()

def status_from_classification(value: str) -> tuple[str, bool, bool, bool, str]:
    cls = (value or "").strip().lower()
    if cls == "bounce":
        return "bounce", False, False, True, "bounce detected by Gmail reply monitor"
    if cls == "not_interested/unsubscribe":
        return "stopped", False, False, True, "stop/unsubscribe detected by Gmail reply monitor"
    if cls == "out-of-office":
        return "out_of_office", False, False, False, ""
    if cls == "positive/meeting interest":
        return "positive", True, False, False, ""
    return "needs_review", False, True, False, ""

applied = 0
skipped = 0
for row in payload.get("new_replies", []):
    if not isinstance(row, dict):
        skipped += 1
        continue
    email = str(row.get("contact_email") or "").strip().lower()
    if not email or email not in contacts:
        skipped += 1
        continue
    contact = contacts[email]
    message_id = str(row.get("message_id") or "")
    existing_ids = {str(e.get("message_id") or "") for e in contact.get("events", []) if isinstance(e, dict)}
    existing_ids.add(str(contact.get("last_reply_message_id") or ""))
    existing_ids.add(str(contact.get("bounce_message_id") or ""))
    if message_id and message_id in existing_ids:
        skipped += 1
        continue

    at = iso_from_row(row)
    thread_id = str(row.get("thread_id") or "")
    snippet = str(row.get("snippet") or "")[:1200]
    reply_status, positive, human_review, stopped, stop_reason = status_from_classification(str(row.get("classification") or ""))

    contact["status"] = "stopped" if stopped else ("positive_reply" if positive else "replied")
    contact["reply_status"] = reply_status
    contact["last_reply_at"] = at
    contact["last_reply_message_id"] = message_id or None
    contact["last_reply_thread_id"] = thread_id or None
    contact["last_reply_from"] = row.get("from")
    contact["last_reply_subject"] = row.get("subject")
    contact["last_reply_snippet"] = snippet
    contact["human_review_required"] = bool(human_review)
    if positive:
        contact["positive_reply"] = True
    if stopped:
        contact["stopped"] = True
        contact["stop_reason"] = stop_reason
    if thread_id:
        if thread_id not in contact.setdefault("thread_ids", []):
            contact["thread_ids"].append(thread_id)
        threads[thread_id] = email

    contact.setdefault("events", []).append(
        {
            "type": "reply_detected",
            "at": at,
            "thread_id": thread_id or None,
            "message_id": message_id or None,
            "classification": row.get("classification"),
            "snippet": snippet[:500],
            "source": "reply_monitor_recent.py",
        }
    )
    applied += 1

tmp = state_path.with_suffix(state_path.suffix + ".tmp")
tmp.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
tmp.replace(state_path)
print(json.dumps({"appliedReplies": applied, "skippedReplies": skipped}))
PY
}

if [ "$RUN_LOCAL_RECONCILE" = "1" ]; then
  run_optional_python "sync_sent_status.py" "$TMP_DIR/sync_sent_status.json"
  run_optional_python "collect_bounces.py" "$TMP_DIR/collect_bounces.json"
  run_optional_python "reply_monitor_recent.py" "$TMP_DIR/reply_monitor_recent.json"
  apply_reply_monitor_output "$TMP_DIR/reply_monitor_recent.json"
else
  info "RUN_LOCAL_RECONCILE=0; uploading current state without local Gmail reconciliation"
fi

python3 -m json.tool "$STATE_PATH" >/dev/null

info "uploading refreshed state to prod GCS"
bash "$SCRIPT_DIR/upload-prod-outreach-state.sh" "$PROJECT_ID" "$STATE_PATH" "$REGION"

if [ "$TRIGGER_DEEP_SYNC" != "1" ]; then
  info "TRIGGER_DEEP_SYNC=0; not calling Mission Control"
  exit 0
fi

info "triggering prod Mission Control deep_sync"
TOKEN="$(gcloud secrets versions access latest --secret="$SERVICE_TOKEN_SECRET" --project="$PROJECT_ID" 2>/dev/null || true)"
if [ -z "$TOKEN" ]; then
  warn "service token secret unavailable ($SERVICE_TOKEN_SECRET); state uploaded but dashboard cache was not refreshed"
  exit 0
fi

HTTP_CODE="$(
  curl -sS -o "$TMP_DIR/deep_sync_response.json" -w "%{http_code}" \
    -X POST "$WEB_URL/api/outreach-crm/v1/actions" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"actionType":"deep_sync","dryRun":false,"instructions":"Scheduled prod Sasha outreach state refresh. Read-only; do not draft or send."}' \
    || true
)"

python3 - "$TMP_DIR/deep_sync_response.json" <<'PY' || true
from __future__ import annotations

import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    print(path.read_text(encoding="utf-8")[:2000])
    raise SystemExit(0)

job = data.get("job") if isinstance(data, dict) else {}
dashboard = job.get("dashboard") if isinstance(job, dict) else {}
kpis = dashboard.get("kpis") if isinstance(dashboard, dict) else {}
summary = {
    "ok": data.get("ok"),
    "jobId": job.get("jobId") or job.get("id"),
    "status": job.get("status"),
    "transport": job.get("transport"),
}
if any(kpis.get(key) is not None for key in ("totalContacts", "initialSent", "replies", "replyRate")):
    summary["kpis"] = {
        "totalContacts": kpis.get("totalContacts"),
        "initialSent": kpis.get("initialSent"),
        "replies": kpis.get("replies"),
        "positive": kpis.get("positive"),
        "bouncedOrStopped": kpis.get("bouncedOrStopped"),
        "dueFollowup": kpis.get("dueFollowup"),
        "replyRate": kpis.get("replyRate"),
    }
print(json.dumps(summary, indent=2, sort_keys=True))
PY

if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
  warn "deep_sync trigger returned HTTP $HTTP_CODE; state upload succeeded"
  exit 0
fi

info "prod state refresh complete"
