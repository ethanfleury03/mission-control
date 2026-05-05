-- CreateTable
CREATE TABLE "help_desk_tickets" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "requestedDate" TIMESTAMP(3),
    "businessImpact" TEXT NOT NULL DEFAULT '',
    "attachmentNote" TEXT NOT NULL DEFAULT '',
    "createdByUserId" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdByEmail" TEXT NOT NULL,
    "team" TEXT NOT NULL DEFAULT '',
    "assignedToEmail" TEXT NOT NULL DEFAULT 'ethan@arrsys.com',
    "visibility" TEXT NOT NULL DEFAULT 'team',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_desk_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_desk_ticket_comments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL DEFAULT '',
    "authorName" TEXT NOT NULL DEFAULT '',
    "authorEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_desk_ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "help_desk_tickets_createdByEmail_idx" ON "help_desk_tickets"("createdByEmail");

-- CreateIndex
CREATE INDEX "help_desk_tickets_status_idx" ON "help_desk_tickets"("status");

-- CreateIndex
CREATE INDEX "help_desk_tickets_visibility_idx" ON "help_desk_tickets"("visibility");

-- CreateIndex
CREATE INDEX "help_desk_tickets_archivedAt_idx" ON "help_desk_tickets"("archivedAt");

-- CreateIndex
CREATE INDEX "help_desk_tickets_updatedAt_idx" ON "help_desk_tickets"("updatedAt");

-- CreateIndex
CREATE INDEX "help_desk_ticket_comments_ticketId_createdAt_idx" ON "help_desk_ticket_comments"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "help_desk_ticket_comments_authorEmail_idx" ON "help_desk_ticket_comments"("authorEmail");

-- AddForeignKey
ALTER TABLE "help_desk_ticket_comments" ADD CONSTRAINT "help_desk_ticket_comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "help_desk_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
