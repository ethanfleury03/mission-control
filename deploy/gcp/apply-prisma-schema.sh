#!/usr/bin/env bash
# Apply Prisma migrations for the Next.js app data plane to Cloud SQL Postgres.
#
# Usage:
#   deploy/gcp/apply-prisma-schema.sh <PROJECT_ID> <REGION> <INSTANCE_NAME> <DB_NAME> <DB_USER> <DB_PASSWORD>
#
# This uses a short-lived Cloud SQL Auth Proxy tunnel and runs `prisma migrate deploy`.

set -euo pipefail

PROJECT_ID="${1:?project id required}"
REGION="${2:?region required}"
INSTANCE_NAME="${3:?instance name required}"
DB_NAME="${4:?db name required}"
DB_USER="${5:?db user required}"
DB_PASS="${6:?db password required}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONN_NAME="${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"

die() { printf 'FATAL: %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "node is required to run Prisma migrations."
command -v npm >/dev/null 2>&1 || die "npm is required to run Prisma migrations."
if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
  echo "==> node_modules not found; installing root dependencies with npm ci"
  (cd "$REPO_ROOT" && npm ci)
fi

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

PROXY_PORT=55433
PROXY_LOG="${TMPDIR:-/tmp}/cloud-sql-proxy-prisma-schema.log"
echo "==> Starting Cloud SQL proxy on 127.0.0.1:${PROXY_PORT} -> ${CONN_NAME}"
cloud-sql-proxy --address 127.0.0.1 --port "$PROXY_PORT" "$CONN_NAME" >"$PROXY_LOG" 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" >/dev/null 2>&1 || true' EXIT

echo "==> Waiting for Postgres via proxy (up to ~3 minutes)..."
READY=0
for _ in $(seq 1 90); do
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "Cloud SQL proxy process exited early. Last 40 lines of $PROXY_LOG:" >&2
    tail -40 "$PROXY_LOG" >&2 || true
    die "cloud-sql-proxy died. Check: gcloud auth application-default login"
  fi
  if node -e "
    const net = require('net');
    const socket = net.connect(Number(process.argv[1]), '127.0.0.1');
    socket.on('connect', () => { socket.destroy(); process.exit(0); });
    socket.on('error', () => process.exit(1));
  " "$PROXY_PORT" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done

if [ "$READY" != "1" ]; then
  echo "Timed out waiting for Postgres. Last 40 lines of $PROXY_LOG:" >&2
  tail -40 "$PROXY_LOG" >&2 || true
  die "Postgres did not become reachable on 127.0.0.1:${PROXY_PORT}"
fi

DB_USER_ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_USER")"
DB_PASS_ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_PASS")"
export DATABASE_URL="postgresql://${DB_USER_ENC}:${DB_PASS_ENC}@127.0.0.1:${PROXY_PORT}/${DB_NAME}?sslmode=disable"

echo "==> Running Prisma migrate deploy"
(cd "$REPO_ROOT" && npx prisma migrate deploy)
