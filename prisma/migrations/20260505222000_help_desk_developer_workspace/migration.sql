ALTER TABLE "help_desk_tickets"
  ADD COLUMN IF NOT EXISTS "nextStep" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "requesterColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP(3);

ALTER TABLE "help_desk_ticket_comments"
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "help_desk_ticket_ai_plans" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "summary" TEXT NOT NULL DEFAULT '',
  "stepsJson" TEXT NOT NULL DEFAULT '[]',
  "suggestedPrompt" TEXT NOT NULL DEFAULT '',
  "filesToInspectJson" TEXT NOT NULL DEFAULT '[]',
  "questionsToAskJson" TEXT NOT NULL DEFAULT '[]',
  "validationChecklistJson" TEXT NOT NULL DEFAULT '[]',
  "riskNotesJson" TEXT NOT NULL DEFAULT '[]',
  "errorMessage" TEXT NOT NULL DEFAULT '',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generatedByModel" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "help_desk_ticket_ai_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "help_desk_ticket_activity_events" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL DEFAULT '',
  "actorName" TEXT NOT NULL DEFAULT '',
  "actorEmail" TEXT NOT NULL DEFAULT '',
  "summary" TEXT NOT NULL DEFAULT '',
  "metadataJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "help_desk_ticket_activity_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "help_desk_tickets_finishedAt_idx" ON "help_desk_tickets"("finishedAt");
CREATE INDEX IF NOT EXISTS "help_desk_ticket_comments_ticketId_visibility_createdAt_idx" ON "help_desk_ticket_comments"("ticketId", "visibility", "createdAt");
CREATE INDEX IF NOT EXISTS "help_desk_ticket_ai_plans_ticketId_generatedAt_idx" ON "help_desk_ticket_ai_plans"("ticketId", "generatedAt");
CREATE INDEX IF NOT EXISTS "help_desk_ticket_ai_plans_status_idx" ON "help_desk_ticket_ai_plans"("status");
CREATE INDEX IF NOT EXISTS "help_desk_ticket_activity_events_ticketId_createdAt_idx" ON "help_desk_ticket_activity_events"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "help_desk_ticket_activity_events_type_idx" ON "help_desk_ticket_activity_events"("type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'help_desk_ticket_ai_plans_ticketId_fkey'
  ) THEN
    ALTER TABLE "help_desk_ticket_ai_plans"
      ADD CONSTRAINT "help_desk_ticket_ai_plans_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "help_desk_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'help_desk_ticket_activity_events_ticketId_fkey'
  ) THEN
    ALTER TABLE "help_desk_ticket_activity_events"
      ADD CONSTRAINT "help_desk_ticket_activity_events_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "help_desk_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
