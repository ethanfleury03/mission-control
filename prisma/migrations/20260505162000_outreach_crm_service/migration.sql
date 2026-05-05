-- CreateTable
CREATE TABLE "outreach_crm_sync_states" (
    "id" TEXT NOT NULL DEFAULT 'sasha-outreach',
    "campaignName" TEXT NOT NULL DEFAULT 'Sasha-Outreach',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "source" TEXT NOT NULL DEFAULT '',
    "lastSyncedAt" TIMESTAMP(3),
    "lastAttemptedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "dashboardJson" TEXT NOT NULL DEFAULT '{}',
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_crm_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_crm_contacts" (
    "id" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL DEFAULT 'Sasha-Outreach',
    "email" TEXT NOT NULL,
    "hubspotContactId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "jobtitle" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "sendStatus" TEXT NOT NULL DEFAULT '',
    "draftStatus" TEXT NOT NULL DEFAULT '',
    "replyStatus" TEXT NOT NULL DEFAULT '',
    "positiveReply" BOOLEAN NOT NULL DEFAULT false,
    "humanReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "stopped" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "inSourceList" BOOLEAN NOT NULL DEFAULT false,
    "eligibleForAutomation" BOOLEAN NOT NULL DEFAULT false,
    "touchCount" INTEGER NOT NULL DEFAULT 0,
    "lastOutboundAt" TIMESTAMP(3),
    "nextFollowupAllowedAt" TIMESTAMP(3),
    "lastReplyAt" TIMESTAMP(3),
    "sourceUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "hubspotUrl" TEXT NOT NULL DEFAULT '',
    "gmailThreadUrl" TEXT NOT NULL DEFAULT '',
    "stopReason" TEXT NOT NULL DEFAULT '',
    "lastReplySnippet" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT NOT NULL DEFAULT '',
    "assignedTo" TEXT NOT NULL DEFAULT '',
    "snapshotJson" TEXT NOT NULL DEFAULT '{}',
    "rawStateJson" TEXT NOT NULL DEFAULT '{}',
    "rawHubspotJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_crm_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_crm_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL DEFAULT 'Sasha-Outreach',
    "contactId" TEXT,
    "email" TEXT NOT NULL DEFAULT '',
    "jobId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "summary" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_crm_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_automation_jobs" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "campaignName" TEXT NOT NULL DEFAULT 'Sasha-Outreach',
    "contactId" TEXT,
    "email" TEXT NOT NULL DEFAULT '',
    "replyThreadId" TEXT NOT NULL DEFAULT '',
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "transport" TEXT NOT NULL DEFAULT '',
    "agentId" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "requestJson" TEXT NOT NULL DEFAULT '{}',
    "guardrailJson" TEXT NOT NULL DEFAULT '{}',
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "rawOutput" TEXT NOT NULL DEFAULT '',
    "blockedReasonsJson" TEXT NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_automation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastError" TEXT NOT NULL DEFAULT '',
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "headersJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_crm_contacts_campaignName_email_key" ON "outreach_crm_contacts"("campaignName", "email");

-- CreateIndex
CREATE INDEX "outreach_crm_contacts_hubspotContactId_idx" ON "outreach_crm_contacts"("hubspotContactId");

-- CreateIndex
CREATE INDEX "outreach_crm_contacts_stage_idx" ON "outreach_crm_contacts"("stage");

-- CreateIndex
CREATE INDEX "outreach_crm_contacts_active_idx" ON "outreach_crm_contacts"("active");

-- CreateIndex
CREATE INDEX "outreach_crm_contacts_inSourceList_idx" ON "outreach_crm_contacts"("inSourceList");

-- CreateIndex
CREATE INDEX "outreach_crm_contacts_eligibleForAutomation_idx" ON "outreach_crm_contacts"("eligibleForAutomation");

-- CreateIndex
CREATE INDEX "outreach_crm_contacts_nextFollowupAllowedAt_idx" ON "outreach_crm_contacts"("nextFollowupAllowedAt");

-- CreateIndex
CREATE INDEX "outreach_crm_contacts_lastReplyAt_idx" ON "outreach_crm_contacts"("lastReplyAt");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_crm_events_idempotencyKey_key" ON "outreach_crm_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "outreach_crm_events_campaignName_occurredAt_idx" ON "outreach_crm_events"("campaignName", "occurredAt");

-- CreateIndex
CREATE INDEX "outreach_crm_events_eventType_idx" ON "outreach_crm_events"("eventType");

-- CreateIndex
CREATE INDEX "outreach_crm_events_contactId_occurredAt_idx" ON "outreach_crm_events"("contactId", "occurredAt");

-- CreateIndex
CREATE INDEX "outreach_crm_events_jobId_idx" ON "outreach_crm_events"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_automation_jobs_idempotencyKey_key" ON "outreach_automation_jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "outreach_automation_jobs_campaignName_createdAt_idx" ON "outreach_automation_jobs"("campaignName", "createdAt");

-- CreateIndex
CREATE INDEX "outreach_automation_jobs_actionType_idx" ON "outreach_automation_jobs"("actionType");

-- CreateIndex
CREATE INDEX "outreach_automation_jobs_status_idx" ON "outreach_automation_jobs"("status");

-- CreateIndex
CREATE INDEX "outreach_automation_jobs_contactId_idx" ON "outreach_automation_jobs"("contactId");

-- CreateIndex
CREATE INDEX "outreach_automation_jobs_email_idx" ON "outreach_automation_jobs"("email");

-- CreateIndex
CREATE INDEX "outreach_webhook_deliveries_eventId_idx" ON "outreach_webhook_deliveries"("eventId");

-- CreateIndex
CREATE INDEX "outreach_webhook_deliveries_status_nextAttemptAt_idx" ON "outreach_webhook_deliveries"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "outreach_crm_events" ADD CONSTRAINT "outreach_crm_events_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "outreach_crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_automation_jobs" ADD CONSTRAINT "outreach_automation_jobs_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "outreach_crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_webhook_deliveries" ADD CONSTRAINT "outreach_webhook_deliveries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "outreach_crm_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
