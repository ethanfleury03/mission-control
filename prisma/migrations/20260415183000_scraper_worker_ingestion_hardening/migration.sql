ALTER TABLE "directory_scrape_jobs" ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "progressJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "heartbeatAt" DATETIME;
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "leaseExpiresAt" DATETIME;
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "nextRetryAt" DATETIME;
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "cancelRequestedAt" DATETIME;
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "errorMessage" TEXT;

UPDATE "directory_scrape_jobs"
SET "phase" = CASE
  WHEN "status" = 'completed' THEN 'completed'
  WHEN "status" = 'failed' THEN 'failed'
  WHEN "status" = 'cancelled' THEN 'cancelled'
  ELSE 'queued'
END;

CREATE INDEX "directory_scrape_jobs_status_leaseExpiresAt_idx" ON "directory_scrape_jobs"("status", "leaseExpiresAt");
CREATE INDEX "directory_scrape_jobs_nextRetryAt_idx" ON "directory_scrape_jobs"("nextRetryAt");
CREATE INDEX "directory_scrape_jobs_phase_idx" ON "directory_scrape_jobs"("phase");

ALTER TABLE "directory_scrape_logs" ADD COLUMN "phase" TEXT;
ALTER TABLE "directory_scrape_logs" ADD COLUMN "eventCode" TEXT;

CREATE INDEX "directory_scrape_logs_jobId_timestamp_idx" ON "directory_scrape_logs"("jobId", "timestamp");

ALTER TABLE "lead_gen_accounts" ADD COLUMN "normalizedName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "lead_gen_accounts" ADD COLUMN "normalizedDomain" TEXT NOT NULL DEFAULT '';

UPDATE "lead_gen_accounts"
SET "normalizedName" = lower(trim("name"))
WHERE "normalizedName" = '';

UPDATE "lead_gen_accounts"
SET "normalizedDomain" = lower(
  trim(
    CASE
      WHEN instr(replace(replace(replace(CASE WHEN "domain" <> '' THEN "domain" ELSE "website" END, 'https://', ''), 'http://', ''), 'www.', ''), '/') > 0
        THEN substr(
          replace(replace(replace(CASE WHEN "domain" <> '' THEN "domain" ELSE "website" END, 'https://', ''), 'http://', ''), 'www.', ''),
          1,
          instr(replace(replace(replace(CASE WHEN "domain" <> '' THEN "domain" ELSE "website" END, 'https://', ''), 'http://', ''), 'www.', ''), '/') - 1
        )
      ELSE replace(replace(replace(CASE WHEN "domain" <> '' THEN "domain" ELSE "website" END, 'https://', ''), 'http://', ''), 'www.', '')
    END
  )
)
WHERE "normalizedDomain" = '';

CREATE INDEX "lead_gen_accounts_marketId_normalizedDomain_idx" ON "lead_gen_accounts"("marketId", "normalizedDomain");
CREATE INDEX "lead_gen_accounts_marketId_normalizedName_country_idx" ON "lead_gen_accounts"("marketId", "normalizedName", "country");

CREATE TABLE "lead_gen_ingestion_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "accountId" TEXT,
    "directoryJobId" TEXT NOT NULL,
    "directoryResultId" TEXT NOT NULL,
    "mergeOutcome" TEXT NOT NULL,
    "conflictFieldsJson" TEXT NOT NULL DEFAULT '[]',
    "detailsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_gen_ingestion_events_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "lead_gen_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "lead_gen_ingestion_events_marketId_createdAt_idx" ON "lead_gen_ingestion_events"("marketId", "createdAt");
CREATE INDEX "lead_gen_ingestion_events_accountId_createdAt_idx" ON "lead_gen_ingestion_events"("accountId", "createdAt");
CREATE INDEX "lead_gen_ingestion_events_directoryJobId_directoryResultId_idx" ON "lead_gen_ingestion_events"("directoryJobId", "directoryResultId");
