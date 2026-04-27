-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "posX" DOUBLE PRECISION DEFAULT 0,
    "posY" DOUBLE PRECISION DEFAULT 0,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_snapshots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "data" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "googleSub" TEXT NOT NULL,
    "hostedDomain" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "role" TEXT NOT NULL DEFAULT 'user',
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "lastLoginIp" TEXT NOT NULL DEFAULT '',
    "lastUserAgent" TEXT NOT NULL DEFAULT '',
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_event_logs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL DEFAULT '',
    "targetEmail" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "route" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directory_scrape_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'queued',
    "inputJson" TEXT NOT NULL,
    "progressJson" TEXT NOT NULL DEFAULT '{}',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "summaryJson" TEXT NOT NULL,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "directory_scrape_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directory_scrape_results" (
    "id" TEXT NOT NULL,
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
    "nameExtractionMetaJson" TEXT,
    "websiteDiscoveryMetaJson" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "directory_scrape_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directory_scrape_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "phase" TEXT,
    "eventCode" TEXT,
    "message" TEXT NOT NULL,

    CONSTRAINT "directory_scrape_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_gen_markets" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "countriesJson" TEXT NOT NULL DEFAULT '[]',
    "personasJson" TEXT NOT NULL DEFAULT '[]',
    "solutionAreasJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_gen_markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_gen_accounts" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL DEFAULT '',
    "normalizedDomain" TEXT NOT NULL DEFAULT '',
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
    "hubspotPushedAt" TIMESTAMP(3),
    "hubspotPushedBy" TEXT NOT NULL DEFAULT '',
    "hubspotLastPushError" TEXT NOT NULL DEFAULT '',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_gen_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_gen_ingestion_events" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "accountId" TEXT,
    "directoryJobId" TEXT NOT NULL,
    "directoryResultId" TEXT NOT NULL,
    "mergeOutcome" TEXT NOT NULL,
    "conflictFieldsJson" TEXT NOT NULL DEFAULT '[]',
    "detailsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_gen_ingestion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_dealers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "stateRegion" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT '',
    "countryIsoA3" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geo_dealers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_hubspot_contact_snapshots" (
    "id" TEXT NOT NULL,
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
    "sourceUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geo_hubspot_contact_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_sync_state" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastAttemptedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "mappableRecords" INTEGER NOT NULL DEFAULT 0,
    "unmappableRecords" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geo_sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_lists" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "displayName" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "sourceMetadataJson" TEXT NOT NULL DEFAULT '{}',
    "totalEntries" INTEGER NOT NULL DEFAULT 0,
    "dialableEntries" INTEGER NOT NULL DEFAULT 0,
    "invalidEntries" INTEGER NOT NULL DEFAULT 0,
    "duplicateEntries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_list_entries" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "phoneRaw" TEXT NOT NULL DEFAULT '',
    "phoneNormalized" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "sourceMetadataJson" TEXT NOT NULL DEFAULT '{}',
    "sourceExternalId" TEXT,
    "queueState" TEXT NOT NULL DEFAULT 'ready',
    "duplicateWithinList" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastOutcome" TEXT NOT NULL DEFAULT 'unknown',
    "lastCallAt" TIMESTAMP(3),
    "retryAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_campaigns" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agentProfileKey" TEXT NOT NULL,
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_calls" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "listId" TEXT,
    "listEntryId" TEXT,
    "providerCallId" TEXT NOT NULL,
    "agentProfileKey" TEXT NOT NULL DEFAULT '',
    "providerStatus" TEXT NOT NULL DEFAULT 'registered',
    "disposition" TEXT NOT NULL DEFAULT 'unknown',
    "bookedFlag" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT NOT NULL DEFAULT '',
    "recordingUrl" TEXT NOT NULL DEFAULT '',
    "disconnectionReason" TEXT NOT NULL DEFAULT '',
    "dynamicVariablesJson" TEXT NOT NULL DEFAULT '{}',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "analysisJson" TEXT NOT NULL DEFAULT '{}',
    "rawPayloadJson" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_call_events" (
    "id" TEXT NOT NULL,
    "phoneCallId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultTimezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "businessHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "businessHoursEnd" TEXT NOT NULL DEFAULT '17:00',
    "activeWeekdaysJson" TEXT NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]',
    "dailyCallCap" INTEGER NOT NULL DEFAULT 50,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 45,
    "maxAttemptsPerLead" INTEGER NOT NULL DEFAULT 3,
    "retryDelayMinutes" INTEGER NOT NULL DEFAULT 240,
    "voicemailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoPauseAfterRepeatedFailures" BOOLEAN NOT NULL DEFAULT true,
    "defaultSourceBehavior" TEXT NOT NULL DEFAULT 'retain_duplicates_mark_invalid',
    "lastRetellSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_generation_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" TEXT NOT NULL DEFAULT 'openrouter',
    "orchestratorModel" TEXT NOT NULL DEFAULT 'deepseek/deepseek-chat-v3.1',
    "promptsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_generation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_generation_runs" (
    "id" TEXT NOT NULL,
    "userPrompt" TEXT NOT NULL DEFAULT '',
    "assistantReply" TEXT NOT NULL DEFAULT '',
    "plannerJson" TEXT NOT NULL DEFAULT '{}',
    "finalImagePrompt" TEXT NOT NULL DEFAULT '',
    "chatModel" TEXT NOT NULL DEFAULT '',
    "imageModel" TEXT NOT NULL DEFAULT '',
    "machineId" TEXT,
    "imageType" TEXT NOT NULL DEFAULT 'linkedin_ad',
    "imageDataUrl" TEXT NOT NULL DEFAULT '',
    "imageMimeType" TEXT NOT NULL DEFAULT 'image/png',
    "imageAlt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_generation_video_runs" (
    "id" TEXT NOT NULL,
    "userPrompt" TEXT NOT NULL DEFAULT '',
    "assistantReply" TEXT NOT NULL DEFAULT '',
    "sourceKind" TEXT NOT NULL,
    "sourceImageRunId" TEXT,
    "sourceImageFileName" TEXT NOT NULL,
    "sourceImageMimeType" TEXT NOT NULL,
    "sourceImageByteSize" INTEGER NOT NULL,
    "sourceImageBytes" BYTEA NOT NULL,
    "videoModel" TEXT NOT NULL DEFAULT '',
    "openrouterJobId" TEXT NOT NULL DEFAULT '',
    "openrouterGenerationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "resolution" TEXT NOT NULL DEFAULT '720p',
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "videoFileName" TEXT,
    "videoMimeType" TEXT,
    "videoByteSize" INTEGER,
    "videoBytes" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_generation_video_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_generation_machines" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "brochureFilename" TEXT,
    "brochureMimeType" TEXT,
    "brochureByteSize" INTEGER,
    "brochurePdf" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_generation_machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_generation_machine_images" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Reference image',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "imageBytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_generation_machine_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_generation_kb_assets" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "imageBytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_generation_kb_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_generation_kb_colors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_generation_kb_colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manuals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manuals_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_googleSub_key" ON "app_users"("googleSub");

-- CreateIndex
CREATE INDEX "app_users_hostedDomain_idx" ON "app_users"("hostedDomain");

-- CreateIndex
CREATE INDEX "app_users_status_idx" ON "app_users"("status");

-- CreateIndex
CREATE INDEX "app_users_role_idx" ON "app_users"("role");

-- CreateIndex
CREATE INDEX "auth_event_logs_type_idx" ON "auth_event_logs"("type");

-- CreateIndex
CREATE INDEX "auth_event_logs_actorEmail_idx" ON "auth_event_logs"("actorEmail");

-- CreateIndex
CREATE INDEX "auth_event_logs_targetEmail_idx" ON "auth_event_logs"("targetEmail");

-- CreateIndex
CREATE INDEX "auth_event_logs_createdAt_idx" ON "auth_event_logs"("createdAt");

-- CreateIndex
CREATE INDEX "directory_scrape_jobs_createdAt_idx" ON "directory_scrape_jobs"("createdAt");

-- CreateIndex
CREATE INDEX "directory_scrape_jobs_status_idx" ON "directory_scrape_jobs"("status");

-- CreateIndex
CREATE INDEX "directory_scrape_jobs_status_leaseExpiresAt_idx" ON "directory_scrape_jobs"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "directory_scrape_jobs_nextRetryAt_idx" ON "directory_scrape_jobs"("nextRetryAt");

-- CreateIndex
CREATE INDEX "directory_scrape_jobs_phase_idx" ON "directory_scrape_jobs"("phase");

-- CreateIndex
CREATE INDEX "directory_scrape_results_jobId_idx" ON "directory_scrape_results"("jobId");

-- CreateIndex
CREATE INDEX "directory_scrape_results_jobId_status_idx" ON "directory_scrape_results"("jobId", "status");

-- CreateIndex
CREATE INDEX "directory_scrape_logs_jobId_idx" ON "directory_scrape_logs"("jobId");

-- CreateIndex
CREATE INDEX "directory_scrape_logs_jobId_timestamp_idx" ON "directory_scrape_logs"("jobId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "lead_gen_markets_slug_key" ON "lead_gen_markets"("slug");

-- CreateIndex
CREATE INDEX "lead_gen_markets_status_idx" ON "lead_gen_markets"("status");

-- CreateIndex
CREATE INDEX "lead_gen_accounts_marketId_idx" ON "lead_gen_accounts"("marketId");

-- CreateIndex
CREATE INDEX "lead_gen_accounts_marketId_reviewState_idx" ON "lead_gen_accounts"("marketId", "reviewState");

-- CreateIndex
CREATE INDEX "lead_gen_accounts_marketId_normalizedDomain_idx" ON "lead_gen_accounts"("marketId", "normalizedDomain");

-- CreateIndex
CREATE INDEX "lead_gen_accounts_marketId_normalizedName_country_idx" ON "lead_gen_accounts"("marketId", "normalizedName", "country");

-- CreateIndex
CREATE INDEX "lead_gen_accounts_directoryJobId_directoryResultId_idx" ON "lead_gen_accounts"("directoryJobId", "directoryResultId");

-- CreateIndex
CREATE INDEX "lead_gen_ingestion_events_marketId_createdAt_idx" ON "lead_gen_ingestion_events"("marketId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_gen_ingestion_events_accountId_createdAt_idx" ON "lead_gen_ingestion_events"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_gen_ingestion_events_directoryJobId_directoryResultId_idx" ON "lead_gen_ingestion_events"("directoryJobId", "directoryResultId");

-- CreateIndex
CREATE INDEX "geo_dealers_status_idx" ON "geo_dealers"("status");

-- CreateIndex
CREATE INDEX "geo_dealers_countryIsoA3_idx" ON "geo_dealers"("countryIsoA3");

-- CreateIndex
CREATE UNIQUE INDEX "geo_hubspot_contact_snapshots_hubspotContactId_key" ON "geo_hubspot_contact_snapshots"("hubspotContactId");

-- CreateIndex
CREATE INDEX "geo_hubspot_contact_snapshots_countryIsoA3_idx" ON "geo_hubspot_contact_snapshots"("countryIsoA3");

-- CreateIndex
CREATE INDEX "geo_hubspot_contact_snapshots_countryIsoA3_stateKey_idx" ON "geo_hubspot_contact_snapshots"("countryIsoA3", "stateKey");

-- CreateIndex
CREATE INDEX "geo_hubspot_contact_snapshots_ownerId_idx" ON "geo_hubspot_contact_snapshots"("ownerId");

-- CreateIndex
CREATE INDEX "geo_hubspot_contact_snapshots_lifecycleStage_idx" ON "geo_hubspot_contact_snapshots"("lifecycleStage");

-- CreateIndex
CREATE INDEX "geo_hubspot_contact_snapshots_leadStatus_idx" ON "geo_hubspot_contact_snapshots"("leadStatus");

-- CreateIndex
CREATE INDEX "geo_hubspot_contact_snapshots_persona_idx" ON "geo_hubspot_contact_snapshots"("persona");

-- CreateIndex
CREATE INDEX "geo_hubspot_contact_snapshots_isMappable_idx" ON "geo_hubspot_contact_snapshots"("isMappable");

-- CreateIndex
CREATE INDEX "phone_lists_status_idx" ON "phone_lists"("status");

-- CreateIndex
CREATE INDEX "phone_lists_sourceType_idx" ON "phone_lists"("sourceType");

-- CreateIndex
CREATE INDEX "phone_list_entries_listId_idx" ON "phone_list_entries"("listId");

-- CreateIndex
CREATE INDEX "phone_list_entries_listId_phoneNormalized_idx" ON "phone_list_entries"("listId", "phoneNormalized");

-- CreateIndex
CREATE INDEX "phone_list_entries_queueState_retryAfter_idx" ON "phone_list_entries"("queueState", "retryAfter");

-- CreateIndex
CREATE INDEX "phone_list_entries_lastCallAt_idx" ON "phone_list_entries"("lastCallAt");

-- CreateIndex
CREATE INDEX "phone_campaigns_status_idx" ON "phone_campaigns"("status");

-- CreateIndex
CREATE INDEX "phone_campaigns_listId_idx" ON "phone_campaigns"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "phone_calls_providerCallId_key" ON "phone_calls"("providerCallId");

-- CreateIndex
CREATE INDEX "phone_calls_campaignId_idx" ON "phone_calls"("campaignId");

-- CreateIndex
CREATE INDEX "phone_calls_listId_idx" ON "phone_calls"("listId");

-- CreateIndex
CREATE INDEX "phone_calls_listEntryId_idx" ON "phone_calls"("listEntryId");

-- CreateIndex
CREATE INDEX "phone_calls_providerStatus_idx" ON "phone_calls"("providerStatus");

-- CreateIndex
CREATE INDEX "phone_calls_disposition_idx" ON "phone_calls"("disposition");

-- CreateIndex
CREATE INDEX "phone_calls_startedAt_idx" ON "phone_calls"("startedAt");

-- CreateIndex
CREATE INDEX "phone_calls_createdAt_idx" ON "phone_calls"("createdAt");

-- CreateIndex
CREATE INDEX "phone_call_events_phoneCallId_createdAt_idx" ON "phone_call_events"("phoneCallId", "createdAt");

-- CreateIndex
CREATE INDEX "image_generation_runs_createdAt_idx" ON "image_generation_runs"("createdAt");

-- CreateIndex
CREATE INDEX "image_generation_video_runs_createdAt_idx" ON "image_generation_video_runs"("createdAt");

-- CreateIndex
CREATE INDEX "image_generation_video_runs_status_idx" ON "image_generation_video_runs"("status");

-- CreateIndex
CREATE INDEX "image_generation_video_runs_openrouterJobId_idx" ON "image_generation_video_runs"("openrouterJobId");

-- CreateIndex
CREATE INDEX "image_generation_machines_title_idx" ON "image_generation_machines"("title");

-- CreateIndex
CREATE INDEX "image_generation_machines_updatedAt_idx" ON "image_generation_machines"("updatedAt");

-- CreateIndex
CREATE INDEX "image_generation_machine_images_machineId_idx" ON "image_generation_machine_images"("machineId");

-- CreateIndex
CREATE INDEX "image_generation_machine_images_updatedAt_idx" ON "image_generation_machine_images"("updatedAt");

-- CreateIndex
CREATE INDEX "image_generation_kb_assets_category_idx" ON "image_generation_kb_assets"("category");

-- CreateIndex
CREATE INDEX "image_generation_kb_assets_updatedAt_idx" ON "image_generation_kb_assets"("updatedAt");

-- CreateIndex
CREATE INDEX "image_generation_kb_colors_updatedAt_idx" ON "image_generation_kb_colors"("updatedAt");

-- CreateIndex
CREATE INDEX "manuals_createdAt_idx" ON "manuals"("createdAt");

-- CreateIndex
CREATE INDEX "manuals_updatedAt_idx" ON "manuals"("updatedAt");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_events" ADD CONSTRAINT "org_events_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directory_scrape_results" ADD CONSTRAINT "directory_scrape_results_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "directory_scrape_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directory_scrape_logs" ADD CONSTRAINT "directory_scrape_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "directory_scrape_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_gen_accounts" ADD CONSTRAINT "lead_gen_accounts_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "lead_gen_markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_list_entries" ADD CONSTRAINT "phone_list_entries_listId_fkey" FOREIGN KEY ("listId") REFERENCES "phone_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_campaigns" ADD CONSTRAINT "phone_campaigns_listId_fkey" FOREIGN KEY ("listId") REFERENCES "phone_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_calls" ADD CONSTRAINT "phone_calls_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "phone_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_calls" ADD CONSTRAINT "phone_calls_listId_fkey" FOREIGN KEY ("listId") REFERENCES "phone_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_calls" ADD CONSTRAINT "phone_calls_listEntryId_fkey" FOREIGN KEY ("listEntryId") REFERENCES "phone_list_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_call_events" ADD CONSTRAINT "phone_call_events_phoneCallId_fkey" FOREIGN KEY ("phoneCallId") REFERENCES "phone_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_generation_machine_images" ADD CONSTRAINT "image_generation_machine_images_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "image_generation_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

