-- Agent Teams Registry Migration
-- PostgreSQL - run as single transaction
-- Order: create tables (no FKs) -> add FKs -> add indexes

-- Extensions (needed for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums (safe on rerun because runner ignores 42710 duplicate_object)
CREATE TYPE team_status AS ENUM ('draft', 'active', 'paused', 'archived');
CREATE TYPE member_status AS ENUM ('invited', 'active', 'suspended', 'removed');
CREATE TYPE policy_scope_type AS ENUM ('global', 'team', 'agent');
CREATE TYPE policy_permission AS ENUM ('deny', 'read', 'draft', 'execute');

-- 1. registry_teams (no FKs - created first)
CREATE TABLE IF NOT EXISTS registry_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  purpose TEXT,
  status team_status DEFAULT 'draft',
  primary_manager_agent_id UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  version INT DEFAULT 1,
  previous_version_id UUID,
  metadata JSONB DEFAULT '{}',
  description TEXT,
  color TEXT DEFAULT '#22d3ee'
);

-- 2. registry_agents
CREATE TABLE IF NOT EXISTS registry_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  role TEXT DEFAULT 'specialist',
  model TEXT,
  system_prompt TEXT,
  system_prompt_ref TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  version INT DEFAULT 1,
  last_published_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  runtime TEXT,
  tokens_used INT DEFAULT 0,
  avatar_type TEXT,
  last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  primary_team_id UUID
);

-- 3. registry_team_members
CREATE TABLE IF NOT EXISTS registry_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  role_in_team TEXT DEFAULT 'specialist',
  status member_status DEFAULT 'invited',
  invited_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, agent_id)
);

-- 4. registry_team_managers
CREATE TABLE IF NOT EXISTS registry_team_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(team_id, agent_id)
);

-- 5. registry_tool_policies
CREATE TABLE IF NOT EXISTS registry_tool_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type policy_scope_type NOT NULL,
  scope_id UUID,
  tool_name TEXT NOT NULL,
  permission policy_permission NOT NULL DEFAULT 'deny',
  require_approval BOOLEAN DEFAULT false,
  max_cost_per_task NUMERIC(10,2),
  rate_limit_per_minute INT,
  constraints JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scope_type, scope_id, tool_name)
);

-- 6. registry_data_access_policies
CREATE TABLE IF NOT EXISTS registry_data_access_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type policy_scope_type NOT NULL,
  scope_id UUID,
  resource TEXT NOT NULL,
  permission policy_permission NOT NULL DEFAULT 'deny',
  constraints JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scope_type, scope_id, resource)
);

-- 7. registry_agent_versions
CREATE TABLE IF NOT EXISTS registry_agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  version INT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

-- 8. registry_team_versions
CREATE TABLE IF NOT EXISTS registry_team_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  version INT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

-- 9. registry_audit_log
CREATE TABLE IF NOT EXISTS registry_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  request_context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. registry_team_run_logs
CREATE TABLE IF NOT EXISTS registry_team_run_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT,
  team_id UUID,
  manager_agent_id UUID,
  manager_fallback_used BOOLEAN DEFAULT false,
  structured_output JSONB,
  raw_log TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. registry_legacy_id_map
CREATE TABLE IF NOT EXISTS registry_legacy_id_map (
  legacy_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  new_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign keys (all tables exist now, duplicate_object ignored by runner)
ALTER TABLE registry_teams ADD CONSTRAINT fk_registry_teams_primary_manager
  FOREIGN KEY (primary_manager_agent_id) REFERENCES registry_agents(id) ON DELETE SET NULL;
ALTER TABLE registry_agents ADD CONSTRAINT fk_registry_agents_primary_team
  FOREIGN KEY (primary_team_id) REFERENCES registry_teams(id) ON DELETE SET NULL;
ALTER TABLE registry_team_members ADD CONSTRAINT fk_registry_team_members_team
  FOREIGN KEY (team_id) REFERENCES registry_teams(id) ON DELETE CASCADE;
ALTER TABLE registry_team_members ADD CONSTRAINT fk_registry_team_members_agent
  FOREIGN KEY (agent_id) REFERENCES registry_agents(id) ON DELETE CASCADE;
ALTER TABLE registry_team_managers ADD CONSTRAINT fk_registry_team_managers_team
  FOREIGN KEY (team_id) REFERENCES registry_teams(id) ON DELETE CASCADE;
ALTER TABLE registry_team_managers ADD CONSTRAINT fk_registry_team_managers_agent
  FOREIGN KEY (agent_id) REFERENCES registry_agents(id) ON DELETE CASCADE;
ALTER TABLE registry_agent_versions ADD CONSTRAINT fk_registry_agent_versions_agent
  FOREIGN KEY (agent_id) REFERENCES registry_agents(id) ON DELETE CASCADE;
ALTER TABLE registry_team_versions ADD CONSTRAINT fk_registry_team_versions_team
  FOREIGN KEY (team_id) REFERENCES registry_teams(id) ON DELETE CASCADE;
ALTER TABLE registry_team_run_logs ADD CONSTRAINT fk_registry_team_run_logs_team
  FOREIGN KEY (team_id) REFERENCES registry_teams(id) ON DELETE SET NULL;
ALTER TABLE registry_team_run_logs ADD CONSTRAINT fk_registry_team_run_logs_manager
  FOREIGN KEY (manager_agent_id) REFERENCES registry_agents(id) ON DELETE SET NULL;

-- Indexes (all at end)
CREATE INDEX IF NOT EXISTS idx_registry_agents_name ON registry_agents(name);
CREATE INDEX IF NOT EXISTS idx_registry_agents_is_active ON registry_agents(is_active);
CREATE INDEX IF NOT EXISTS idx_registry_agents_primary_team ON registry_agents(primary_team_id);
CREATE INDEX IF NOT EXISTS idx_registry_teams_status ON registry_teams(status);
CREATE INDEX IF NOT EXISTS idx_registry_teams_name ON registry_teams(name);
CREATE INDEX IF NOT EXISTS idx_registry_teams_primary_manager ON registry_teams(primary_manager_agent_id);
CREATE INDEX IF NOT EXISTS idx_registry_team_members_team ON registry_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_registry_team_members_agent ON registry_team_members(agent_id);
CREATE INDEX IF NOT EXISTS idx_registry_team_members_status ON registry_team_members(status);
CREATE INDEX IF NOT EXISTS idx_registry_team_managers_team ON registry_team_managers(team_id);
CREATE INDEX IF NOT EXISTS idx_registry_tool_policies_scope ON registry_tool_policies(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_registry_data_access_scope ON registry_data_access_policies(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_registry_agent_versions_agent ON registry_agent_versions(agent_id);
CREATE INDEX IF NOT EXISTS idx_registry_team_versions_team ON registry_team_versions(team_id);
CREATE INDEX IF NOT EXISTS idx_registry_audit_entity ON registry_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_registry_audit_created ON registry_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_registry_team_run_logs_task ON registry_team_run_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_registry_team_run_logs_team ON registry_team_run_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_registry_legacy_entity ON registry_legacy_id_map(entity_type, new_id);
