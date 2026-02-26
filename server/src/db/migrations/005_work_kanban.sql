-- Work Kanban Migration 005
-- Minimal Kanban board: work_kanban_items + work_kanban_events
-- No seeding - empty board is valid.

-- 1. work_kanban_items (Kanban-specific, no team_id required)
CREATE TABLE IF NOT EXISTS work_kanban_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'queue' CHECK (status IN ('queue', 'ongoing', 'need_human', 'completed')),
  priority INT NOT NULL DEFAULT 0,
  agent_id UUID REFERENCES registry_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_work_kanban_items_status ON work_kanban_items(status);
CREATE INDEX IF NOT EXISTS idx_work_kanban_items_agent_id ON work_kanban_items(agent_id);

-- 2. work_kanban_events (event log for Kanban items)
CREATE TABLE IF NOT EXISTS work_kanban_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES work_kanban_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'moved', 'assigned', 'deleted')),
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_kanban_events_item ON work_kanban_events(item_id, created_at DESC);

-- 3. Trigger: Auto-update work_kanban_items.updated_at
CREATE OR REPLACE FUNCTION update_work_kanban_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_work_kanban_items_updated_at ON work_kanban_items;
CREATE TRIGGER trigger_work_kanban_items_updated_at
  BEFORE UPDATE ON work_kanban_items
  FOR EACH ROW
  EXECUTE FUNCTION update_work_kanban_items_updated_at();

-- Migration complete marker
INSERT INTO registry_migrations (name) VALUES ('005_work_kanban.sql')
ON CONFLICT (name) DO NOTHING;
