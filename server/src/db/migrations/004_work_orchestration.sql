-- Work Orchestration System Migration 004
-- Adds work_items, work_events, approvals, exceptions with state machines and immutability

-- Enums (idempotent: partial reruns after a failed migration must not error on duplicate types)
DO $enum$ BEGIN
  CREATE TYPE work_status AS ENUM (
    'queued', 'claimed', 'working', 'needs_review', 'blocked', 'done', 'failed', 'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE approval_status AS ENUM ('requested', 'approved', 'denied', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE exception_type AS ENUM (
    'policy_violation', 'missing_info', 'low_confidence', 'tool_error', 'conflict', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE exception_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE exception_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

-- 1. work_items (durable work queue)
CREATE TABLE IF NOT EXISTS work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES registry_teams(id) ON DELETE CASCADE,
  parent_work_item_id UUID REFERENCES work_items(id) ON DELETE SET NULL,
  
  -- State machine
  status work_status NOT NULL DEFAULT 'queued',
  priority INT NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ,
  
  -- Request context
  requested_by_type TEXT NOT NULL CHECK (requested_by_type IN ('human', 'system', 'api')),
  requested_by_id TEXT,
  
  -- Assignment
  manager_agent_id UUID REFERENCES registry_agents(id) ON DELETE SET NULL,
  assignee_agent_id UUID REFERENCES registry_agents(id) ON DELETE SET NULL,
  
  -- Idempotency (critical for retries)
  idempotency_key TEXT UNIQUE,
  
  -- Task content
  input JSONB NOT NULL DEFAULT '{}',
  structured_output JSONB,
  raw_log TEXT,
  
  -- Retry tracking
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_work_items_status_team ON work_items(status, team_id);
CREATE INDEX IF NOT EXISTS idx_work_items_assignee_status ON work_items(assignee_agent_id, status) WHERE assignee_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_manager_status ON work_items(manager_agent_id, status) WHERE manager_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_parent ON work_items(parent_work_item_id);
CREATE INDEX IF NOT EXISTS idx_work_items_priority_created ON work_items(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_work_items_due ON work_items(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_idempotency ON work_items(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2. work_events (append-only event log)
CREATE TABLE IF NOT EXISTS work_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL,
  -- STATUS_CHANGED, CLAIMED, ASSIGNED, OUTPUT_WRITTEN, RETRIED, ESCALATED,
  -- APPROVAL_REQUESTED, APPROVAL_RESOLVED, EXCEPTION_CREATED, DELEGATED, COMPLETED, FAILED
  
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'agent', 'human')),
  actor_id TEXT,
  
  -- Change tracking
  old_value JSONB,
  new_value JSONB,
  message TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_events_work_item ON work_events(work_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_events_type ON work_events(event_type);
CREATE INDEX IF NOT EXISTS idx_work_events_created ON work_events(created_at DESC);

-- 3. approvals (human-in-the-loop)
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  
  action_type TEXT NOT NULL, -- send_email, create_calendar_event, crm_update, exec_command, etc.
  payload JSONB NOT NULL DEFAULT '{}',
  
  status approval_status NOT NULL DEFAULT 'requested',
  
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  requested_by TEXT NOT NULL,
  resolved_by TEXT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_work_item ON approvals(work_item_id);
CREATE INDEX IF NOT EXISTS idx_approvals_requested ON approvals(requested_at) WHERE status = 'requested';

-- 4. exceptions (problem tracking)
CREATE TABLE IF NOT EXISTS exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  
  type exception_type NOT NULL,
  severity exception_severity NOT NULL DEFAULT 'medium',
  status exception_status NOT NULL DEFAULT 'open',
  
  message TEXT NOT NULL,
  context JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exceptions_status_severity ON exceptions(status, severity);
CREATE INDEX IF NOT EXISTS idx_exceptions_work_item ON exceptions(work_item_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_open ON exceptions(created_at DESC) WHERE status = 'open';

-- 5. Trigger: Auto-update work_items.updated_at
CREATE OR REPLACE FUNCTION update_work_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_work_items_updated_at ON work_items;
CREATE TRIGGER trigger_work_items_updated_at
  BEFORE UPDATE ON work_items
  FOR EACH ROW
  EXECUTE FUNCTION update_work_items_updated_at();

-- 6. Trigger: Auto-update exceptions.updated_at
CREATE OR REPLACE FUNCTION update_exceptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_exceptions_updated_at ON exceptions;
CREATE TRIGGER trigger_exceptions_updated_at
  BEFORE UPDATE ON exceptions
  FOR EACH ROW
  EXECUTE FUNCTION update_exceptions_updated_at();

-- 7. Trigger: Block UPDATE/DELETE on work_events (immutability)
CREATE OR REPLACE FUNCTION prevent_work_events_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'work_events is append-only: updates are not allowed';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'work_events is append-only: deletes are not allowed';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_work_events_immutable ON work_events;
CREATE TRIGGER trigger_work_events_immutable
  BEFORE UPDATE OR DELETE ON work_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_work_events_modification();

-- 8. Function: Claim next work item (atomic with SKIP LOCKED)
CREATE OR REPLACE FUNCTION claim_next_work_item(
  p_worker_id TEXT,
  p_limit INT DEFAULT 1
)
RETURNS TABLE (work_item_id UUID, team_id UUID, input JSONB, priority INT) AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT wi.id, wi.team_id, wi.input, wi.priority
    FROM work_items wi
    WHERE wi.status = 'queued'
    ORDER BY wi.priority DESC, wi.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE work_items wi
  SET 
    status = 'claimed',
    attempt_count = attempt_count + 1,
    claimed_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  FROM claimed
  WHERE wi.id = claimed.id
  RETURNING wi.id, wi.team_id, wi.input, wi.priority;
  
  -- Log claim events
  INSERT INTO work_events (work_item_id, event_type, actor_type, actor_id, new_value, message)
  SELECT 
    claimed.id,
    'CLAIMED',
    'system',
    p_worker_id,
    jsonb_build_object('status', 'claimed'),
    'Work item claimed by worker'
  FROM claimed;
END;
$$ LANGUAGE plpgsql;

-- Migration complete marker
INSERT INTO registry_migrations (name) VALUES ('004_work_orchestration.sql')
ON CONFLICT (name) DO NOTHING;
