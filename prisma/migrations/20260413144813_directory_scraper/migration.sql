-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "type" TEXT NOT NULL DEFAULT 'leaf',
    "avatar" TEXT,
    "permissions" TEXT,
    "profileFile" TEXT,
    "departmentId" TEXT,
    "managerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "posX" REAL DEFAULT 0,
    "posY" REAL DEFAULT 0,
    CONSTRAINT "people_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "people_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "people" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "org_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_events_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "org_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "data" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

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
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "org_events_personId_idx" ON "org_events"("personId");

-- CreateIndex
CREATE INDEX "org_events_createdAt_idx" ON "org_events"("createdAt");

-- CreateIndex
CREATE INDEX "org_snapshots_createdAt_idx" ON "org_snapshots"("createdAt");

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
