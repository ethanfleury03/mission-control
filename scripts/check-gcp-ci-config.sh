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
api_config="deploy/gcp/cloudbuild.api.yaml"

for required in \
  "_APP_DB_SECRET: mc-app-db-url" \
  "_AUTH_SECRET: mc-auth-secret" \
  "_GOOGLE_ID_SECRET: mc-google-client-id" \
  "_GOOGLE_SECRET_SECRET: mc-google-client-secret" \
  'DATABASE_URL=${_APP_DB_SECRET}:latest' \
  'AUTH_SECRET=${_AUTH_SECRET}:latest' \
  'AUTH_GOOGLE_ID=${_GOOGLE_ID_SECRET}:latest' \
  'AUTH_GOOGLE_SECRET=${_GOOGLE_SECRET_SECRET}:latest'
do
  grep -Fq "$required" "$web_config" || fail "$web_config is missing required secret mapping: $required"
done

grep -Fq "_CLOUD_SQL_INSTANCE" "$web_config" || fail "$web_config must require _CLOUD_SQL_INSTANCE"
grep -Fq -- "--add-cloudsql-instances" "$web_config" || fail "$web_config must attach Cloud SQL to mc-web"

grep -Fq "_API_DB_SECRET: mc-api-db-url" "$api_config" || fail "$api_config is missing _API_DB_SECRET default"
grep -Fq 'DATABASE_URL=${_API_DB_SECRET}:latest' "$api_config" || fail "$api_config is missing DATABASE_URL secret mapping"
grep -Fq "_CLOUD_SQL_INSTANCE" "$api_config" || fail "$api_config must require _CLOUD_SQL_INSTANCE"
grep -Fq -- "--add-cloudsql-instances" "$api_config" || fail "$api_config must attach Cloud SQL to mc-api"

grep -Fq "_APP_DB_SECRET: mc-app-db-url" "$scraper_config" || fail "$scraper_config is missing _APP_DB_SECRET default"
grep -Fq 'DATABASE_URL=${_APP_DB_SECRET}:latest' "$scraper_config" || fail "$scraper_config is missing DATABASE_URL secret mapping"
grep -Fq "_CLOUD_SQL_INSTANCE" "$scraper_config" || fail "$scraper_config must require _CLOUD_SQL_INSTANCE"
grep -Fq -- "--set-cloudsql-instances" "$scraper_config" || fail "$scraper_config must attach Cloud SQL to mc-scraper"

for script in deploy/gcp/bootstrap-env.sh deploy/gcp/deploy-env.sh deploy/gcp/verify-env.sh deploy/gcp/env-config.sh; do
  [ -f "$script" ] || fail "$script is required for environment-aware deploys"
done

grep -Fq "mc-web-stage" deploy/gcp/env-config.sh || fail "env-config.sh must define staging web service"
grep -Fq "missioncontrol_app_stage" deploy/gcp/env-config.sh || fail "env-config.sh must define staging app database"
grep -Fq "mc-stage-app-db-url" deploy/gcp/env-config.sh || fail "env-config.sh must define staging app DB secret"
grep -Fq "mc_require_prod_branch" deploy/gcp/deploy-env.sh || fail "deploy-env.sh must guard production deploy branch"

if grep -R --line-number "TURSO_" .github/workflows deploy/gcp/cloudbuild*.yaml deploy/gcp/bootstrap.sh 2>/dev/null; then
  fail "production CI/deploy config must not require TURSO_* runtime env vars"
fi

echo "OK: GCP deployment config invariants hold"
