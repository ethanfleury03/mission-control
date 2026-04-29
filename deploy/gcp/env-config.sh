#!/usr/bin/env bash
# Shared environment naming for Mission Control GCP deploys.
#
# Source this file from deployment scripts, then call:
#   mc_resolve_env stage|prod
#   mc_assert_safe_env

mc_die() { printf 'FATAL: %s\n' "$*" >&2; exit 1; }
mc_warn() { printf 'WARN: %s\n' "$*" >&2; }
mc_info() { printf '==> %s\n' "$*"; }

mc_validate_project_id() {
  local project_id="${1:-}"
  [ -n "$project_id" ] || mc_die "PROJECT_ID is required"
  case "$project_id" in
    PROJECT | PROJECT_ID | YOUR_PROJECT_ID | '<PROJECT_ID>' | '<PROJECT>')
      mc_die "replace '$project_id' with your real GCP project ID. Check it with: gcloud projects list"
      ;;
  esac
  if [[ ! "$project_id" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
    mc_die "'$project_id' does not look like a valid GCP project ID. Check it with: gcloud projects list"
  fi
}

mc_resolve_env() {
  MC_ENV="${1:-}"
  case "$MC_ENV" in
    prod | production)
      MC_ENV="prod"
      MC_ENV_LABEL="Production"
      MC_AR_REPO="mission-control"
      MC_SQL_INSTANCE="mc-sql"
      MC_API_DB="missioncontrol"
      MC_APP_DB="missioncontrol_app"
      MC_SQL_USER="mcapp"
      MC_WEB_SERVICE="mc-web"
      MC_API_SERVICE="mc-api"
      MC_SCRAPER_JOB="mc-scraper"
      MC_SCHEDULER_JOB="mc-scraper-tick"
      MC_WEB_SA="mc-web-sa"
      MC_API_SA="mc-api-sa"
      MC_SCRAPER_SA="mc-scraper-sa"
      MC_SCHEDULER_SA="mc-scheduler-sa"
      MC_BUILD_RUNNER_SA="mc-build-runner"
      MC_API_DB_SECRET="mc-api-db-url"
      MC_APP_DB_SECRET="mc-app-db-url"
      MC_DB_PASSWORD_SECRET="mc-api-db-password"
      MC_AUTH_SECRET="mc-auth-secret"
      MC_GOOGLE_ID_SECRET="mc-google-client-id"
      MC_GOOGLE_SECRET_SECRET="mc-google-client-secret"
      MC_OPENROUTER_SECRET="mc-openrouter"
      MC_IMAGE_OPENROUTER_SECRET="mc-image-openrouter"
      MC_FIRECRAWL_SECRET="mc-firecrawl"
      MC_SERPER_SECRET="mc-serper"
      MC_HUBSPOT_TOKEN_SECRET="mc-hubspot-token"
      MC_HUBSPOT_PORTAL_SECRET="mc-hubspot-portal"
      MC_GOOGLE_SA_EMAIL_SECRET="mc-google-sa-email"
      MC_GOOGLE_SA_KEY_SECRET="mc-google-sa-key"
      MC_WEBHOOK_URL_SECRET="mc-webhook-url"
      MC_WEBHOOK_SECRET_SECRET="mc-webhook-secret"
      MC_IMAGE_CHAT_MODEL="${MC_IMAGE_CHAT_MODEL:-deepseek/deepseek-v4-flash}"
      MC_IMAGE_IMAGE_MODEL="${MC_IMAGE_IMAGE_MODEL:-openai/gpt-5.4-image-2}"
      MC_IMAGE_VIDEO_MODEL="${MC_IMAGE_VIDEO_MODEL:-google/veo-3.1-fast}"
      MC_PUBLIC_URL="${MC_PROD_PUBLIC_URL:-${MISSION_CONTROL_PUBLIC_URL:-https://hub.arrsys.com}}"
      ;;
    stage | staging)
      MC_ENV="stage"
      MC_ENV_LABEL="Staging"
      MC_AR_REPO="mission-control"
      MC_SQL_INSTANCE="mc-sql"
      MC_API_DB="missioncontrol_stage"
      MC_APP_DB="missioncontrol_app_stage"
      MC_SQL_USER="mcapp"
      MC_WEB_SERVICE="mc-web-stage"
      MC_API_SERVICE="mc-api-stage"
      MC_SCRAPER_JOB="mc-scraper-stage"
      MC_SCHEDULER_JOB="mc-scraper-stage-tick"
      MC_WEB_SA="mc-web-stage-sa"
      MC_API_SA="mc-api-stage-sa"
      MC_SCRAPER_SA="mc-scraper-stage-sa"
      MC_SCHEDULER_SA="mc-scheduler-stage-sa"
      MC_BUILD_RUNNER_SA="mc-build-runner"
      MC_API_DB_SECRET="mc-stage-api-db-url"
      MC_APP_DB_SECRET="mc-stage-app-db-url"
      MC_DB_PASSWORD_SECRET="mc-api-db-password"
      MC_AUTH_SECRET="mc-stage-auth-secret"
      MC_GOOGLE_ID_SECRET="mc-stage-google-client-id"
      MC_GOOGLE_SECRET_SECRET="mc-stage-google-client-secret"
      MC_OPENROUTER_SECRET="mc-stage-openrouter"
      MC_IMAGE_OPENROUTER_SECRET="mc-stage-image-openrouter"
      MC_FIRECRAWL_SECRET="mc-stage-firecrawl"
      MC_SERPER_SECRET="mc-stage-serper"
      MC_HUBSPOT_TOKEN_SECRET="mc-stage-hubspot-token"
      MC_HUBSPOT_PORTAL_SECRET="mc-stage-hubspot-portal"
      MC_GOOGLE_SA_EMAIL_SECRET="mc-stage-google-sa-email"
      MC_GOOGLE_SA_KEY_SECRET="mc-stage-google-sa-key"
      MC_WEBHOOK_URL_SECRET="mc-stage-webhook-url"
      MC_WEBHOOK_SECRET_SECRET="mc-stage-webhook-secret"
      MC_IMAGE_CHAT_MODEL="${MC_STAGE_IMAGE_CHAT_MODEL:-${MC_IMAGE_CHAT_MODEL:-deepseek/deepseek-v4-flash}}"
      MC_IMAGE_IMAGE_MODEL="${MC_STAGE_IMAGE_IMAGE_MODEL:-${MC_IMAGE_IMAGE_MODEL:-openai/gpt-5.4-image-2}}"
      MC_IMAGE_VIDEO_MODEL="${MC_STAGE_IMAGE_VIDEO_MODEL:-${MC_IMAGE_VIDEO_MODEL:-google/veo-3.1-fast}}"
      MC_PUBLIC_URL="${MC_STAGE_PUBLIC_URL:-}"
      ;;
    *)
      mc_die "environment must be 'stage' or 'prod'"
      ;;
  esac
}

mc_assert_safe_env() {
  [ -n "${MC_ENV:-}" ] || mc_die "mc_resolve_env must be called first"

  if [ "$MC_ENV" = "stage" ]; then
    [ "$MC_WEB_SERVICE" != "mc-web" ] || mc_die "stage web service resolved to production name"
    [ "$MC_API_SERVICE" != "mc-api" ] || mc_die "stage api service resolved to production name"
    [ "$MC_SCRAPER_JOB" != "mc-scraper" ] || mc_die "stage scraper job resolved to production name"
    [ "$MC_API_DB" != "missioncontrol" ] || mc_die "stage api database resolved to production database"
    [ "$MC_APP_DB" != "missioncontrol_app" ] || mc_die "stage app database resolved to production database"
    [ "$MC_API_DB_SECRET" != "mc-api-db-url" ] || mc_die "stage api DB secret resolved to production secret"
    [ "$MC_APP_DB_SECRET" != "mc-app-db-url" ] || mc_die "stage app DB secret resolved to production secret"
    [[ "$MC_API_DB" == *_stage ]] || mc_die "stage api database must end with _stage"
    [[ "$MC_APP_DB" == *_stage ]] || mc_die "stage app database must end with _stage"
  fi

  if [ "$MC_ENV" = "prod" ]; then
    [[ "$MC_API_DB" != *_stage ]] || mc_die "prod api database points to staging"
    [[ "$MC_APP_DB" != *_stage ]] || mc_die "prod app database points to staging"
    [[ "$MC_WEB_SERVICE" != *-stage ]] || mc_die "prod web service points to staging"
    [[ "$MC_API_SERVICE" != *-stage ]] || mc_die "prod api service points to staging"
    [[ "$MC_SCRAPER_JOB" != *-stage ]] || mc_die "prod scraper job points to staging"
  fi
}

mc_require_prod_branch() {
  if [ "${MC_ENV:-}" != "prod" ] || [ "${MC_ALLOW_NON_MAIN_PROD:-}" = "1" ]; then
    return 0
  fi
  if ! command -v git >/dev/null 2>&1; then
    mc_die "git is required for production branch guard; set MC_ALLOW_NON_MAIN_PROD=1 to override"
  fi
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [ "$branch" = "main" ] || mc_die "production deploys must run from main (current: ${branch:-unknown}); set MC_ALLOW_NON_MAIN_PROD=1 to override"
}

mc_print_env_summary() {
  cat <<EOF
Environment: $MC_ENV
Web service: $MC_WEB_SERVICE
API service: $MC_API_SERVICE
Scraper job: $MC_SCRAPER_JOB
Scheduler job: $MC_SCHEDULER_JOB
API database: $MC_API_DB
App database: $MC_APP_DB
API DB secret: $MC_API_DB_SECRET
App DB secret: $MC_APP_DB_SECRET
Auth secret: $MC_AUTH_SECRET
Google OAuth ID secret: $MC_GOOGLE_ID_SECRET
Google OAuth secret secret: $MC_GOOGLE_SECRET_SECRET
Image chat model: $MC_IMAGE_CHAT_MODEL
Image model: $MC_IMAGE_IMAGE_MODEL
Video model: $MC_IMAGE_VIDEO_MODEL
Public URL override: ${MC_PUBLIC_URL:-"(run.app after deploy)"}
EOF
}

mc_secret_value_or_empty() {
  local secret="$1"
  if gcloud secrets describe "$secret" >/dev/null 2>&1; then
    gcloud secrets versions access latest --secret="$secret"
  fi
}

mc_upsert_secret() {
  local secret="$1"
  local value="$2"
  if [ -z "$value" ]; then
    return 0
  fi
  if ! gcloud secrets describe "$secret" >/dev/null 2>&1; then
    gcloud secrets create "$secret" --replication-policy=automatic >/dev/null
  fi
  printf '%s' "$value" | gcloud secrets versions add "$secret" --data-file=- >/dev/null
}

mc_copy_secret_if_present() {
  local source_secret="$1"
  local target_secret="$2"
  if gcloud secrets describe "$target_secret" >/dev/null 2>&1; then
    return 0
  fi
  if gcloud secrets describe "$source_secret" >/dev/null 2>&1; then
    mc_info "Copying secret $source_secret -> $target_secret"
    mc_upsert_secret "$target_secret" "$(gcloud secrets versions access latest --secret="$source_secret")"
  fi
}
