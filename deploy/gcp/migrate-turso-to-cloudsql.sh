#!/usr/bin/env bash
# Low-downtime data migration helper for moving the Prisma app data plane from Turso to Cloud SQL.
#
# Usage:
#   deploy/gcp/migrate-turso-to-cloudsql.sh <TURSO_DB_NAME> <PROJECT_ID> <REGION> <INSTANCE_NAME> <APP_DB_NAME> <DB_USER> <DB_PASSWORD> [WORK_DIR]
#
# Requires: turso, sqlite3, pgloader, psql, cloud-sql-proxy, npm dependencies installed.
# Recommended flow:
#   1. Rehearse against a staging app DB.
#   2. Pause writes (disable scraper scheduler and block UI/API mutating routes).
#   3. Run this script for the final export/import.
#   4. Deploy mc-web and mc-scraper with DATABASE_URL=mc-app-db-url.
#   5. Resume writes after smoke tests pass.

set -euo pipefail

TURSO_DB_NAME="${1:?TURSO_DB_NAME required}"
PROJECT_ID="${2:?PROJECT_ID required}"
REGION="${3:?REGION required}"
INSTANCE_NAME="${4:?INSTANCE_NAME required}"
APP_DB_NAME="${5:?APP_DB_NAME required}"
DB_USER="${6:?DB_USER required}"
DB_PASS="${7:?DB_PASSWORD required}"
WORK_DIR="${8:-"${TMPDIR:-/tmp}/mc-turso-cloudsql-migration-$(date +%Y%m%d%H%M%S)"}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONN_NAME="${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"

die() { printf 'FATAL: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

need turso
need sqlite3
need pgloader
need psql
need cloud-sql-proxy

mkdir -p "$WORK_DIR"
DUMP_SQL="$WORK_DIR/turso-dump.sql"
SOURCE_SQLITE="$WORK_DIR/turso-source.sqlite"
COUNT_SQL="$WORK_DIR/table-counts.sql"
SOURCE_COUNTS="$WORK_DIR/source-counts.tsv"
TARGET_COUNTS="$WORK_DIR/target-counts.tsv"
PGLOADER_CTL="$WORK_DIR/load-data.load"

cat >&2 <<EOF
==> Migration work dir: $WORK_DIR
==> Source Turso DB:    $TURSO_DB_NAME
==> Target Cloud SQL:   $CONN_NAME / $APP_DB_NAME

Before final production cutover, make sure writes are paused:
  gcloud scheduler jobs pause mc-scraper-tick --location=$REGION
  deploy/read-only gate enabled for mc-web mutating routes
EOF

echo "==> Exporting Turso SQL dump"
turso db shell "$TURSO_DB_NAME" ".dump" >"$DUMP_SQL"

echo "==> Materializing dump into local SQLite file"
rm -f "$SOURCE_SQLITE"
sqlite3 "$SOURCE_SQLITE" <"$DUMP_SQL"

echo "==> Applying Prisma schema to target Cloud SQL app DB"
bash "$SCRIPT_DIR/apply-prisma-schema.sh" "$PROJECT_ID" "$REGION" "$INSTANCE_NAME" "$APP_DB_NAME" "$DB_USER" "$DB_PASS"

PROXY_PORT=55434
PROXY_LOG="$WORK_DIR/cloud-sql-proxy-import.log"
echo "==> Starting Cloud SQL proxy on 127.0.0.1:${PROXY_PORT} -> ${CONN_NAME}"
cloud-sql-proxy --address 127.0.0.1 --port "$PROXY_PORT" "$CONN_NAME" >"$PROXY_LOG" 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" >/dev/null 2>&1 || true' EXIT

READY=0
for _ in $(seq 1 90); do
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    tail -40 "$PROXY_LOG" >&2 || true
    die "cloud-sql-proxy died"
  fi
  if pg_isready -h 127.0.0.1 -p "$PROXY_PORT" -U "$DB_USER" -d "$APP_DB_NAME" -q 2>/dev/null; then
    READY=1
    break
  fi
  sleep 2
done
if [ "$READY" != "1" ]; then
  tail -40 "$PROXY_LOG" >&2 || true
  die "Postgres did not become reachable on 127.0.0.1:${PROXY_PORT}"
fi

DB_USER_ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_USER")"
DB_PASS_ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_PASS")"
TARGET_URL="postgresql://${DB_USER_ENC}:${DB_PASS_ENC}@127.0.0.1:${PROXY_PORT}/${APP_DB_NAME}?sslmode=disable"

cat >"$PGLOADER_CTL" <<EOF
LOAD DATABASE
  FROM sqlite:///$SOURCE_SQLITE
  INTO $TARGET_URL

WITH data only,
     truncate,
     reset sequences,
     quote identifiers,
     workers = 4,
     concurrency = 2

EXCLUDING TABLE NAMES LIKE 'sqlite_%';
EOF

echo "==> Loading data into Cloud SQL with pgloader"
pgloader "$PGLOADER_CTL"

echo "==> Building table-count validation SQL"
sqlite3 "$SOURCE_SQLITE" <<'SQL' >"$COUNT_SQL"
.headers off
.mode list
SELECT 'SELECT ' || quote(name) || ' AS table_name, COUNT(*)::bigint AS postgres_count FROM "' || replace(name, '"', '""') || '";'
FROM sqlite_master
WHERE type = 'table'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name;
SQL

echo "==> Source counts"
: >"$SOURCE_COUNTS"
while IFS= read -r TABLE_NAME; do
  COUNT="$(sqlite3 "$SOURCE_SQLITE" "SELECT COUNT(*) FROM \"$TABLE_NAME\";")"
  printf '%s\t%s\n' "$TABLE_NAME" "$COUNT" | tee -a "$SOURCE_COUNTS"
done < <(sqlite3 "$SOURCE_SQLITE" "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")

echo "==> Target counts"
PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -p "$PROXY_PORT" -U "$DB_USER" -d "$APP_DB_NAME" \
  -v ON_ERROR_STOP=1 -At -F $'\t' -f "$COUNT_SQL" | tee "$TARGET_COUNTS"

echo "==> Comparing row counts"
if ! diff -u "$SOURCE_COUNTS" "$TARGET_COUNTS"; then
  die "Source and target row counts differ. Inspect $SOURCE_COUNTS and $TARGET_COUNTS."
fi

echo "==> Recording migration audit row"
PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -p "$PROXY_PORT" -U "$DB_USER" -d "$APP_DB_NAME" \
  -v ON_ERROR_STOP=1 \
  -v source_identity="$TURSO_DB_NAME" \
  -v work_dir="$WORK_DIR" <<'SQL'
CREATE TABLE IF NOT EXISTS app_data_migration_audit (
  id BIGSERIAL PRIMARY KEY,
  source_kind TEXT NOT NULL,
  source_identity TEXT NOT NULL,
  work_dir TEXT NOT NULL,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_data_migration_audit (source_kind, source_identity, work_dir)
VALUES ('turso', :'source_identity', :'work_dir');
SQL

echo "==> Done. Keep $WORK_DIR until validation and rollback-retention checks are complete."
