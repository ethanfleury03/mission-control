PRAGMA foreign_keys=OFF;

DROP INDEX IF EXISTS "directory_scrape_jobs_status_leaseExpiresAt_idx";
DROP INDEX IF EXISTS "directory_scrape_jobs_nextRetryAt_idx";
DROP INDEX IF EXISTS "directory_scrape_jobs_phase_idx";

CREATE TABLE "directory_scrape_jobs_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL,
  "phase" TEXT NOT NULL DEFAULT 'queued',
  "inputJson" TEXT NOT NULL,
  "progressJson" TEXT NOT NULL DEFAULT '{}',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  "heartbeatAt" DATETIME,
  "leaseOwner" TEXT,
  "leaseExpiresAt" DATETIME,
  "nextRetryAt" DATETIME,
  "cancelRequestedAt" DATETIME,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "summaryJson" TEXT NOT NULL,
  "metaJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "directory_scrape_jobs_new" (
  "id",
  "status",
  "phase",
  "inputJson",
  "progressJson",
  "attemptCount",
  "maxAttempts",
  "queuedAt",
  "startedAt",
  "finishedAt",
  "heartbeatAt",
  "leaseOwner",
  "leaseExpiresAt",
  "nextRetryAt",
  "cancelRequestedAt",
  "errorCode",
  "errorMessage",
  "summaryJson",
  "metaJson",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "status",
  CASE
    WHEN "phase" IS NOT NULL AND trim("phase") <> '' THEN "phase"
    WHEN "status" = 'completed' THEN 'completed'
    WHEN "status" = 'failed' THEN 'failed'
    WHEN "status" = 'cancelled' THEN 'cancelled'
    ELSE 'queued'
  END,
  "inputJson",
  COALESCE("progressJson", '{}'),
  COALESCE("attemptCount", 0),
  COALESCE("maxAttempts", 3),
  COALESCE("createdAt", CURRENT_TIMESTAMP),
  "startedAt",
  "finishedAt",
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  "summaryJson",
  COALESCE("metaJson", '{}'),
  COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt"
FROM "directory_scrape_jobs";

DROP TABLE "directory_scrape_jobs";
ALTER TABLE "directory_scrape_jobs_new" RENAME TO "directory_scrape_jobs";

CREATE INDEX "directory_scrape_jobs_status_idx" ON "directory_scrape_jobs"("status");
CREATE INDEX "directory_scrape_jobs_createdAt_idx" ON "directory_scrape_jobs"("createdAt");
CREATE INDEX "directory_scrape_jobs_status_leaseExpiresAt_idx" ON "directory_scrape_jobs"("status", "leaseExpiresAt");
CREATE INDEX "directory_scrape_jobs_nextRetryAt_idx" ON "directory_scrape_jobs"("nextRetryAt");
CREATE INDEX "directory_scrape_jobs_phase_idx" ON "directory_scrape_jobs"("phase");

ALTER TABLE "directory_scrape_logs" ADD COLUMN "phase" TEXT;
ALTER TABLE "directory_scrape_logs" ADD COLUMN "eventCode" TEXT;
CREATE INDEX IF NOT EXISTS "directory_scrape_logs_jobId_timestamp_idx" ON "directory_scrape_logs"("jobId", "timestamp");

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

CREATE INDEX IF NOT EXISTS "lead_gen_accounts_marketId_normalizedDomain_idx" ON "lead_gen_accounts"("marketId", "normalizedDomain");
CREATE INDEX IF NOT EXISTS "lead_gen_accounts_marketId_normalizedName_country_idx" ON "lead_gen_accounts"("marketId", "normalizedName", "country");

CREATE TABLE IF NOT EXISTS "lead_gen_ingestion_events" (
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

CREATE INDEX IF NOT EXISTS "lead_gen_ingestion_events_marketId_createdAt_idx" ON "lead_gen_ingestion_events"("marketId", "createdAt");
CREATE INDEX IF NOT EXISTS "lead_gen_ingestion_events_accountId_createdAt_idx" ON "lead_gen_ingestion_events"("accountId", "createdAt");
CREATE INDEX IF NOT EXISTS "lead_gen_ingestion_events_directoryJobId_directoryResultId_idx" ON "lead_gen_ingestion_events"("directoryJobId", "directoryResultId");

PRAGMA foreign_keys=ON;
