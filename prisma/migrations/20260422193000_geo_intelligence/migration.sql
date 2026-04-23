CREATE TABLE "geo_dealers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "stateRegion" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT '',
    "countryIsoA3" TEXT NOT NULL DEFAULT '',
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "geo_dealers_status_idx" ON "geo_dealers"("status");
CREATE INDEX "geo_dealers_countryIsoA3_idx" ON "geo_dealers"("countryIsoA3");

CREATE TABLE "geo_hubspot_contact_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hubspotContactId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT '',
    "countryIsoA3" TEXT NOT NULL DEFAULT '',
    "stateRegion" TEXT NOT NULL DEFAULT '',
    "stateCode" TEXT NOT NULL DEFAULT '',
    "stateKey" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT NOT NULL DEFAULT '',
    "ownerName" TEXT NOT NULL DEFAULT '',
    "lifecycleStage" TEXT NOT NULL DEFAULT '',
    "leadStatus" TEXT NOT NULL DEFAULT '',
    "persona" TEXT NOT NULL DEFAULT '',
    "isMappable" BOOLEAN NOT NULL DEFAULT false,
    "sourceUpdatedAt" DATETIME,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "geo_hubspot_contact_snapshots_hubspotContactId_key" ON "geo_hubspot_contact_snapshots"("hubspotContactId");
CREATE INDEX "geo_hubspot_contact_snapshots_countryIsoA3_idx" ON "geo_hubspot_contact_snapshots"("countryIsoA3");
CREATE INDEX "geo_hubspot_contact_snapshots_countryIsoA3_stateKey_idx" ON "geo_hubspot_contact_snapshots"("countryIsoA3", "stateKey");
CREATE INDEX "geo_hubspot_contact_snapshots_ownerId_idx" ON "geo_hubspot_contact_snapshots"("ownerId");
CREATE INDEX "geo_hubspot_contact_snapshots_lifecycleStage_idx" ON "geo_hubspot_contact_snapshots"("lifecycleStage");
CREATE INDEX "geo_hubspot_contact_snapshots_leadStatus_idx" ON "geo_hubspot_contact_snapshots"("leadStatus");
CREATE INDEX "geo_hubspot_contact_snapshots_persona_idx" ON "geo_hubspot_contact_snapshots"("persona");
CREATE INDEX "geo_hubspot_contact_snapshots_isMappable_idx" ON "geo_hubspot_contact_snapshots"("isMappable");

CREATE TABLE "geo_sync_state" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastAttemptedAt" DATETIME,
    "lastSyncedAt" DATETIME,
    "lastError" TEXT NOT NULL DEFAULT '',
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "mappableRecords" INTEGER NOT NULL DEFAULT 0,
    "unmappableRecords" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
