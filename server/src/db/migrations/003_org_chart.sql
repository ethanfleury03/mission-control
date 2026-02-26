-- Org Chart tables (PostgreSQL)
-- Replaces Prisma SQLite schema, single source of truth in Postgres

CREATE TABLE IF NOT EXISTS org_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_departments_name ON org_departments(name);

CREATE TABLE IF NOT EXISTS org_people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT,
  level INT DEFAULT 1,
  status TEXT DEFAULT 'active',
  type TEXT DEFAULT 'leaf',
  avatar TEXT,
  permissions TEXT,
  profile_file TEXT,
  department_id UUID REFERENCES org_departments(id) ON DELETE SET NULL,
  manager_id TEXT REFERENCES org_people(id) ON DELETE SET NULL,
  pos_x FLOAT DEFAULT 0,
  pos_y FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_people_department ON org_people(department_id);
CREATE INDEX IF NOT EXISTS idx_org_people_manager ON org_people(manager_id);
CREATE INDEX IF NOT EXISTS idx_org_people_status ON org_people(status);

CREATE TABLE IF NOT EXISTS org_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  person_id TEXT NOT NULL REFERENCES org_people(id) ON DELETE CASCADE,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  metadata TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_events_person ON org_events(person_id);
CREATE INDEX IF NOT EXISTS idx_org_events_created ON org_events(created_at);

CREATE TABLE IF NOT EXISTS org_snapshots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  data JSONB NOT NULL,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_snapshots_created ON org_snapshots(created_at);
