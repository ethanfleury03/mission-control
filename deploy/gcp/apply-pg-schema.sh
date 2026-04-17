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
echo "==> Starting Cloud SQL proxy on 127.0.0.1:${PROXY_PORT} -> ${CONN_NAME}"
cloud-sql-proxy --port "$PROXY_PORT" "$CONN_NAME" >/tmp/cloud-sql-proxy.log 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 30); do
  if (echo > /dev/tcp/127.0.0.1/"$PROXY_PORT") >/dev/null 2>&1; then break; fi
  sleep 1
done

if ! command -v psql >/dev/null 2>&1; then
  echo "FATAL: psql is required on PATH (sudo apt-get install postgresql-client)" >&2
  exit 1
fi

export PGPASSWORD="$DB_PASS"

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
