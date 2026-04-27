#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

for script in deploy/gcp/*.sh; do
  bash -n "$script"
done

web_config="deploy/gcp/cloudbuild.web.yaml"
scraper_config="deploy/gcp/cloudbuild.scraper.yaml"

for required in \
  "DATABASE_URL=mc-app-db-url:latest" \
  "AUTH_SECRET=mc-auth-secret:latest" \
  "AUTH_GOOGLE_ID=mc-google-client-id:latest" \
  "AUTH_GOOGLE_SECRET=mc-google-client-secret:latest"
do
  grep -Fq "$required" "$web_config" || fail "$web_config is missing required secret mapping: $required"
done

grep -Fq "_CLOUD_SQL_INSTANCE" "$web_config" || fail "$web_config must require _CLOUD_SQL_INSTANCE"
grep -Fq -- "--add-cloudsql-instances" "$web_config" || fail "$web_config must attach Cloud SQL to mc-web"

grep -Fq "DATABASE_URL=mc-app-db-url:latest" "$scraper_config" || fail "$scraper_config is missing DATABASE_URL secret mapping"
grep -Fq "_CLOUD_SQL_INSTANCE" "$scraper_config" || fail "$scraper_config must require _CLOUD_SQL_INSTANCE"
grep -Fq -- "--set-cloudsql-instances" "$scraper_config" || fail "$scraper_config must attach Cloud SQL to mc-scraper"

if grep -R --line-number "TURSO_" .github/workflows deploy/gcp/cloudbuild*.yaml deploy/gcp/bootstrap.sh 2>/dev/null; then
  fail "production CI/deploy config must not require TURSO_* runtime env vars"
fi

echo "OK: GCP deployment config invariants hold"
