# Mission Control App Data Migration Runbook

This runbook moves the Next.js/Prisma data plane from Turso to GCP Cloud SQL Postgres. The Express `mc-api` data plane already uses Cloud SQL.

## Rehearsal

1. Create or choose a staging Cloud SQL app database.
2. Install local tools: `turso`, `sqlite3`, `pgloader`, `psql`, `cloud-sql-proxy`.
3. Run the migration helper against staging:

```bash
bash deploy/gcp/migrate-turso-to-cloudsql.sh \
  mission-control \
  PROJECT_ID \
  us-central1 \
  mc-sql \
  missioncontrol_app_staging \
  mcapp \
  'DB_PASSWORD'
```

4. Confirm the script finishes with matching row counts.
5. Start `mc-web` and `mc-scraper` against the staging `DATABASE_URL` and smoke test login, lead-gen markets, scraper jobs, phone lists/campaigns, manuals, and Image Studio binary records.

## Production Cutover

1. Pause write paths:
   - `gcloud scheduler jobs pause mc-scraper-tick --location=us-central1`
   - set `MISSION_CONTROL_READ_ONLY=1` on `mc-web` to block mutating `/api` requests while leaving reads, auth, and health checks available.
   - stop any local workers or import scripts that can write to the app database.
2. Run the migration helper against `missioncontrol_app`.
3. Deploy `mc-web` and `mc-scraper` using the updated Cloud Build configs so both receive `DATABASE_URL=mc-app-db-url:latest` and the Cloud SQL instance attachment.
4. Smoke test:
   - `/api/healthz`
   - Google login and admin diagnostics
   - lead-gen market/account counts
   - directory scraper enqueue and worker pickup
   - phone campaign/list read/write
   - manual and Image Studio binary upload/read
   - `mc-api` `/health`
5. Resume writes:
   - `gcloud scheduler jobs resume mc-scraper-tick --location=us-central1`
   - remove `MISSION_CONTROL_READ_ONLY` or set it to `0`.

## Rollback

Keep Turso untouched until at least one successful Cloud SQL backup cycle has completed. If rollback is needed before then, redeploy the previous Cloud Run revisions that still used Turso and keep the Cloud SQL app database for postmortem comparison.

## Audit

The helper records each completed import in `app_data_migration_audit` with source identity, work directory, and migration timestamp. Keep the helper work directory until row-count validation and stakeholder checks are complete.
