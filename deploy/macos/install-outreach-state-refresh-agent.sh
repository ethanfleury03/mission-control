#!/usr/bin/env bash
# Install a macOS LaunchAgent that keeps the prod Outreach CRM deep-sync state
# fresh without exposing the Mac as a public webhook server.
#
# Usage:
#   bash deploy/macos/install-outreach-state-refresh-agent.sh <PROJECT_ID> [REGION] [INTERVAL_SECONDS]

set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${2:-us-central1}"
INTERVAL_SECONDS="${3:-900}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNNER="$REPO_ROOT/deploy/gcp/refresh-prod-outreach-state.sh"

LABEL="com.arrsys.outreach-state-refresh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="${OUTREACH_REFRESH_LOG_DIR:-/opt/openclaw_stack/logs}"
OUT_LOG="$LOG_DIR/outreach-state-refresh.out.log"
ERR_LOG="$LOG_DIR/outreach-state-refresh.err.log"

die() {
  echo "FATAL: $*" >&2
  exit 1
}

[ -n "$PROJECT_ID" ] || die "PROJECT_ID required"
[ -f "$RUNNER" ] || die "runner not found: $RUNNER"
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$RUNNER</string>
    <string>$PROJECT_ID</string>
    <string>$REGION</string>
  </array>
  <key>StartInterval</key>
  <integer>$INTERVAL_SECONDS</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$OUT_LOG</string>
  <key>StandardErrorPath</key>
  <string>$ERR_LOG</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>MC_OUTREACH_PROD_WEB_URL</key>
    <string>https://hub.arrsys.com</string>
  </dict>
</dict>
</plist>
EOF

plutil -lint "$PLIST" >/dev/null

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

cat <<EOF
Installed $LABEL
  Plist: $PLIST
  Runs every: ${INTERVAL_SECONDS}s
  Stdout: $OUT_LOG
  Stderr: $ERR_LOG

Check status:
  launchctl print gui/$(id -u)/$LABEL

Disable:
  launchctl bootout gui/$(id -u) "$PLIST"
EOF
