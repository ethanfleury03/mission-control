#!/usr/bin/env bash
# Apply database/migrations/*.sql for the RAG support assistant to Cloud SQL Postgres.
#
# Usage:
#   deploy/gcp/apply-rag-schema.sh <PROJECT_ID> <REGION> <INSTANCE_NAME> <DB_NAME> <DB_USER> <DB_PASSWORD>

set -euo pipefail

PROJECT_ID="${1:?project id required}"
REGION="${2:?region required}"
INSTANCE_NAME="${3:?instance name required}"
DB_NAME="${4:?db name required}"
DB_USER="${5:?db user required}"
DB_PASS="${6:?db password required}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MIG_DIR="$REPO_ROOT/database/migrations"
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
  if command -v brew >/dev/null 2>&1; then
    echo "On macOS, run: brew install libpq && brew link --force libpq" >&2
  fi
  return 1
}

ensure_psql || die "psql is required to apply RAG SQL migrations."

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

PROXY_PORT=55434
PROXY_LOG="${TMPDIR:-/tmp}/cloud-sql-proxy-rag-schema.log"
echo "==> Starting Cloud SQL proxy on 127.0.0.1:${PROXY_PORT} -> ${CONN_NAME}"
cloud-sql-proxy --address 127.0.0.1 --port "$PROXY_PORT" "$CONN_NAME" >"$PROXY_LOG" 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" >/dev/null 2>&1 || true' EXIT

export PGPASSWORD="$DB_PASS"

echo "==> Waiting for Postgres via proxy (up to ~3 minutes)..."
READY=0
for _ in $(seq 1 90); do
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "Cloud SQL proxy process exited early. Last 40 lines of $PROXY_LOG:" >&2
    tail -40 "$PROXY_LOG" >&2 || true
    die "cloud-sql-proxy died. Check: gcloud auth application-default login"
  fi
  if pg_isready -h 127.0.0.1 -p "$PROXY_PORT" -U "$DB_USER" -d "$DB_NAME" -q 2>/dev/null; then
    READY=1
    break
  fi
  sleep 2
done

[ "$READY" = "1" ] || die "Postgres did not become reachable on 127.0.0.1:${PROXY_PORT}"

for FILE in $(find "$MIG_DIR" -maxdepth 1 -name '*rag*.sql' -o -name '*RAG*.sql' | sort); do
  echo "  ++ apply $(basename "$FILE")"
  psql -h 127.0.0.1 -p "$PROXY_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -f "$FILE"
done

echo "==> RAG schema migrations applied"
