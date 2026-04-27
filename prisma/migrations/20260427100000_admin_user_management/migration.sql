ALTER TABLE "app_users" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "app_users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "app_users" ADD COLUMN "loginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "app_users" ADD COLUMN "lastSeenAt" DATETIME;
ALTER TABLE "app_users" ADD COLUMN "lastLoginIp" TEXT NOT NULL DEFAULT '';
ALTER TABLE "app_users" ADD COLUMN "lastUserAgent" TEXT NOT NULL DEFAULT '';
ALTER TABLE "app_users" ADD COLUMN "disabledAt" DATETIME;

CREATE INDEX "app_users_status_idx" ON "app_users"("status");
CREATE INDEX "app_users_role_idx" ON "app_users"("role");

CREATE TABLE "auth_event_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL DEFAULT '',
    "targetEmail" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "route" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "auth_event_logs_type_idx" ON "auth_event_logs"("type");
CREATE INDEX "auth_event_logs_actorEmail_idx" ON "auth_event_logs"("actorEmail");
CREATE INDEX "auth_event_logs_targetEmail_idx" ON "auth_event_logs"("targetEmail");
CREATE INDEX "auth_event_logs_createdAt_idx" ON "auth_event_logs"("createdAt");
