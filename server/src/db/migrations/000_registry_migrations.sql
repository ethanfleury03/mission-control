-- Ledger table for registry/work SQL migrations (used by 004/005 markers and mc-api migrateRegistry.ts).
-- Must run before 004_work_orchestration.sql which inserts into this table.

CREATE TABLE IF NOT EXISTS registry_migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
