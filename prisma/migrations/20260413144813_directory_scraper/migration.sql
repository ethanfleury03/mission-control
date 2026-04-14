-- Directory Scraper tables only (org chart models are managed separately / may exist from other workflows).
-- If `prisma migrate` reports a checksum mismatch for this file, your DB was created with an older
-- revision that also created org tables; resolve with `prisma migrate resolve` or reset the dev DB.

-- CreateTable
CREATE TABLE "directory_scrape_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "summaryJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "directory_scrape_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "directoryListingUrl" TEXT NOT NULL,
    "companyWebsite" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "contactPageUrl" TEXT NOT NULL DEFAULT '',
    "socialLinks" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "rawContactJson" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "directory_scrape_results_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "directory_scrape_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "directory_scrape_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    CONSTRAINT "directory_scrape_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "directory_scrape_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "directory_scrape_jobs_createdAt_idx" ON "directory_scrape_jobs"("createdAt");

-- CreateIndex
CREATE INDEX "directory_scrape_jobs_status_idx" ON "directory_scrape_jobs"("status");

-- CreateIndex
CREATE INDEX "directory_scrape_results_jobId_idx" ON "directory_scrape_results"("jobId");

-- CreateIndex
CREATE INDEX "directory_scrape_results_jobId_status_idx" ON "directory_scrape_results"("jobId", "status");

-- CreateIndex
CREATE INDEX "directory_scrape_logs_jobId_idx" ON "directory_scrape_logs"("jobId");
