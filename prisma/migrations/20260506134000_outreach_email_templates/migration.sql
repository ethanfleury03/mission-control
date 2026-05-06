CREATE TABLE "outreach_email_templates" (
    "id" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL DEFAULT 'Sasha-Outreach',
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_email_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outreach_email_templates_campaignName_updatedAt_idx" ON "outreach_email_templates"("campaignName", "updatedAt");
CREATE INDEX "outreach_email_templates_category_idx" ON "outreach_email_templates"("category");
CREATE INDEX "outreach_email_templates_isActive_idx" ON "outreach_email_templates"("isActive");
