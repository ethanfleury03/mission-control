CREATE TABLE "app_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "googleSub" TEXT NOT NULL,
    "hostedDomain" TEXT NOT NULL DEFAULT '',
    "lastLoginAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");
CREATE UNIQUE INDEX "app_users_googleSub_key" ON "app_users"("googleSub");
CREATE INDEX "app_users_hostedDomain_idx" ON "app_users"("hostedDomain");
