-- Lead Generation: markets and accounts (directory scraper can import into accounts)

CREATE TABLE "lead_gen_markets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "countriesJson" TEXT NOT NULL DEFAULT '[]',
    "personasJson" TEXT NOT NULL DEFAULT '[]',
    "solutionAreasJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "lead_gen_markets_slug_key" ON "lead_gen_markets"("slug");

CREATE INDEX "lead_gen_markets_status_idx" ON "lead_gen_markets"("status");

CREATE TABLE "lead_gen_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'Unknown',
    "region" TEXT NOT NULL DEFAULT '',
    "industry" TEXT NOT NULL DEFAULT '',
    "subindustry" TEXT NOT NULL DEFAULT '',
    "companySizeBand" TEXT NOT NULL DEFAULT 'unknown',
    "revenueBand" TEXT NOT NULL DEFAULT 'unknown',
    "description" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL DEFAULT 'demo',
    "sourceName" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "directoryJobId" TEXT,
    "directoryResultId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'prospect',
    "fitScore" INTEGER NOT NULL DEFAULT 0,
    "fitSummary" TEXT NOT NULL DEFAULT '',
    "assignedOwner" TEXT NOT NULL DEFAULT '',
    "reviewState" TEXT NOT NULL DEFAULT 'new',
    "leadPipelineStage" TEXT NOT NULL DEFAULT 'discovered',
    "hubspotContactId" TEXT,
    "hubspotPushedAt" DATETIME,
    "hubspotPushedBy" TEXT NOT NULL DEFAULT '',
    "hubspotLastPushError" TEXT NOT NULL DEFAULT '',
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "lead_gen_accounts_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "lead_gen_markets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "lead_gen_accounts_marketId_idx" ON "lead_gen_accounts"("marketId");

CREATE INDEX "lead_gen_accounts_marketId_reviewState_idx" ON "lead_gen_accounts"("marketId", "reviewState");

CREATE INDEX "lead_gen_accounts_directoryJobId_directoryResultId_idx" ON "lead_gen_accounts"("directoryJobId", "directoryResultId");
