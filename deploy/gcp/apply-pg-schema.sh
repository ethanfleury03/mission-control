#!/usr/bin/env bash
# Apply server/src/db/migrations/*.sql to the Cloud SQL Postgres instance.
# Uses a short-lived Cloud SQL Auth Proxy tunnel so we don't need public IPs.
#
# Usage:
#   deploy/gcp/apply-pg-schema.sh <PROJECT_ID> <REGION> <INSTANCE_NAME> <DB_NAME> <DB_USER> <DB_PASSWORD>
#
# Idempotent: each migration has its own guard. re-running is safe.

set -euo pipefail

PROJECT_ID="${1:?project id required}"
REGION="${2:?region required}"
INSTANCE_NAME="${3:?instance name required}"
DB_NAME="${4:?db name required}"
DB_USER="${5:?db user required}"
DB_PASS="${6:?db password required}"

MIG_DIR="$(cd "$(dirname "$0")/../../server/src/db/migrations" && pwd)"
CONN_NAME="${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"

die() { printf 'FATAL: %s\n' "$*" >&2; exit 1; }

ensure_psql() {
  if command -v psql >/dev/null 2>&1; then
    return 0
  fi
  echo "==> psql not found; attempting to install PostgreSQL client..." >&2
  if command -v apt-get >/dev/null 2>&1; then
    APT_UPDATE="apt-get update -qq"
    APT_INSTALL="apt-get install -y postgresql-client"
    if command -v sudo >/dev/null 2>&1 && [ "$(id -u)" != "0" ]; then
      APT_UPDATE="sudo DEBIAN_FRONTEND=noninteractive $APT_UPDATE"
      APT_INSTALL="sudo DEBIAN_FRONTEND=noninteractive $APT_INSTALL"
    else
      APT_UPDATE="DEBIAN_FRONTEND=noninteractive $APT_UPDATE"
      APT_INSTALL="DEBIAN_FRONTEND=noninteractive $APT_INSTALL"
    fi
    if eval "$APT_UPDATE" && eval "$APT_INSTALL"; then
      return 0
    fi
  fi
  if command -v apk >/dev/null 2>&1; then
    APK="apk add --no-cache"
    if command -v sudo >/dev/null 2>&1 && [ "$(id -u)" != "0" ]; then APK="sudo $APK"; fi
    if eval "$APK postgresql16-client" 2>/dev/null || eval "$APK postgresql15-client" 2>/dev/null || eval "$APK postgresql-client"; then
      return 0
    fi
  fi
  if command -v brew >/dev/null 2>&1; then
    echo "On macOS, run: brew install libpq && brew link --force libpq" >&2
    echo "Then re-run this script (or re-run deploy/gcp/bootstrap.sh)." >&2
  else
    echo "Install the PostgreSQL client, then re-run:" >&2
    echo "  Debian/Ubuntu: sudo apt-get install -y postgresql-client" >&2
    echo "  RHEL/Fedora:   sudo dnf install -y postgresql" >&2
  fi
  return 1
}

ensure_psql || die "psql is required to apply SQL migrations."

echo "==> Installing cloud-sql-proxy (if missing)"
if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
  TMP=$(mktemp -d)
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) ARCH=amd64 ;;
    aarch64 | arm64) ARCH=arm64 ;;
  esac
  curl -fsSL -o "$TMP/cloud-sql-proxy" \
    "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.11.4/cloud-sql-proxy.${OS}.${ARCH}"
  chmod +x "$TMP/cloud-sql-proxy"
  export PATH="$TMP:$PATH"
fi

PROXY_PORT=55432
PROXY_LOG="${TMPDIR:-/tmp}/cloud-sql-proxy-apply-schema.log"
echo "==> Starting Cloud SQL proxy on 127.0.0.1:${PROXY_PORT} -> ${CONN_NAME}"
# Bind explicitly; logs help when the proxy exits early (auth, network, wrong arch).
cloud-sql-proxy --address 127.0.0.1 --port "$PROXY_PORT" "$CONN_NAME" >"$PROXY_LOG" 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" >/dev/null 2>&1 || true' EXIT

export PGPASSWORD="$DB_PASS"

echo "==> Waiting for Postgres via proxy (pg_isready, up to ~3 minutes)..."
READY=0
for i in $(seq 1 90); do
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "Cloud SQL proxy process exited early. Last 40 lines of $PROXY_LOG:" >&2
    tail -40 "$PROXY_LOG" >&2 || true
    die "cloud-sql-proxy died (see log above). Check: gcloud auth application-default login"
  fi
  if pg_isready -h 127.0.0.1 -p "$PROXY_PORT" -U "$DB_USER" -d "$DB_NAME" -q 2>/dev/null; then
    READY=1
    break
  fi
  sleep 2
done

if [ "$READY" != "1" ]; then
  echo "Timed out waiting for Postgres. Last 40 lines of $PROXY_LOG:" >&2
  tail -40 "$PROXY_LOG" >&2 || true
  die "Postgres did not become ready on 127.0.0.1:${PROXY_PORT}"
fi

TRACKER_SQL=$(cat <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL
)

echo "==> Ensuring schema_migrations tracker"
psql -h 127.0.0.1 -p "$PROXY_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -c "$TRACKER_SQL"

APPLIED_ANY=0
for FILE in $(ls "$MIG_DIR"/*.sql | sort); do
  NAME="$(basename "$FILE")"
  EXISTS=$(psql -h 127.0.0.1 -p "$PROXY_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tAc "SELECT 1 FROM schema_migrations WHERE name = '$NAME' LIMIT 1;")
  if [ "$EXISTS" = "1" ]; then
    echo "  -- skip $NAME (already applied)"
    continue
  fi
  echo "  ++ apply $NAME"
  psql -h 127.0.0.1 -p "$PROXY_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -f "$FILE"
  psql -h 127.0.0.1 -p "$PROXY_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations (name) VALUES ('$NAME');"
  APPLIED_ANY=1
done

if [ "$APPLIED_ANY" = "0" ]; then
  echo "==> Schema up to date, nothing applied"
else
  echo "==> Schema migrations applied"
fi
