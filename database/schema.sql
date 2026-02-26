-- Kanban Task Management Schema
-- PostgreSQL database for Mission Control

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tasks table (main kanban data)
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'queue', -- queue, ongoing, completed, need_human
    priority VARCHAR(10) NOT NULL DEFAULT 'medium', -- low, medium, high
    
    -- Assignments
    assigned_to VARCHAR(100), -- agent name or user ID
    created_by VARCHAR(100) NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ, -- when moved to ongoing
    completed_at TIMESTAMPTZ, -- when moved to completed
    
    -- Source tracking (where task originated)
    channel VARCHAR(50), -- discord, whatsapp, etc.
    channel_id VARCHAR(100),
    session_id VARCHAR(100),
    message_id VARCHAR(100),
    
    -- AI-generated vs human-created
    source VARCHAR(20) DEFAULT 'manual', -- manual, ai_suggested, webhook
    
    -- JSON for flexible metadata
    metadata JSONB DEFAULT '{}',
    
    -- Soft delete
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(100)
);

-- Task history (audit trail for all changes)
CREATE TABLE task_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    field_changed VARCHAR(50) NOT NULL, -- status, title, assigned_to, etc.
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Task comments
CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- AI analysis
    sentiment VARCHAR(20), -- positive, neutral, negative
    ai_summary TEXT -- auto-generated summary
);

-- Task tags (many-to-many)
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) DEFAULT '#22d3ee',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE task_tags (
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);

-- Views for dashboard
CREATE VIEW tasks_by_status AS
SELECT 
    status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))/3600) as avg_hours
FROM tasks 
WHERE deleted_at IS NULL
GROUP BY status;

CREATE VIEW tasks_recent AS
SELECT *
FROM tasks
WHERE deleted_at IS NULL
ORDER BY updated_at DESC
LIMIT 100;

-- Indexes for performance
CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_created ON tasks(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_task_history_task ON task_history(task_id, changed_at DESC);
CREATE INDEX idx_tasks_channel ON tasks(channel, channel_id) WHERE deleted_at IS NULL;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Trigger to log status changes
CREATE OR REPLACE FUNCTION log_task_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO task_history (task_id, field_changed, old_value, new_value, changed_by)
        VALUES (NEW.id, 'status', OLD.status, NEW.status, COALESCE(NEW.metadata->>'changed_by', 'system'));
    END IF;
    
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
        INSERT INTO task_history (task_id, field_changed, old_value, new_value, changed_by)
        VALUES (NEW.id, 'assigned_to', OLD.assigned_to, NEW.assigned_to, COALESCE(NEW.metadata->>'changed_by', 'system'));
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_history_log
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_task_changes();

-- Sample data
INSERT INTO tasks (title, status, priority, assigned_to, created_by, channel, source) VALUES
('Setup Postgres database for Clawd', 'queue', 'medium', 'Clawd', 'system', 'discord', 'ai_suggested'),
('Review security audit report', 'queue', 'high', NULL, 'ethan', 'discord', 'manual'),
('Update dependencies', 'queue', 'low', NULL, 'system', 'internal', 'webhook'),
('Design new dashboard widgets', 'queue', 'medium', NULL, 'ethan', 'discord', 'manual'),
('DEMO4: Research task + feedback', 'ongoing', 'high', 'Clawd', 'system', 'discord', 'ai_suggested'),
('Implement OAuth2 flow', 'ongoing', 'high', 'Forge', 'ethan', 'whatsapp', 'manual'),
('Write integration tests', 'ongoing', 'medium', 'Athena', 'ethan', 'telegram', 'manual'),
('Update API documentation', 'completed', 'low', 'Quill', 'system', 'discord', 'manual'),
('Fix memory leak in worker', 'completed', 'high', 'Clawd', 'system', 'internal', 'ai_suggested'),
('Setup CI/CD pipeline', 'completed', 'high', 'Athena', 'ethan', 'discord', 'manual'),
('Fix authentication bug', 'need_human', 'high', 'Clawd', 'system', 'discord', 'ai_suggested'),
('Clarify business requirements', 'need_human', 'high', 'Forge', 'ethan', 'whatsapp', 'manual'),
('Waiting for API key approval', 'need_human', 'medium', 'Athena', 'ethan', 'telegram', 'manual');

INSERT INTO tags (name, color) VALUES
('bug', '#ef4444'),
('feature', '#22c55e'),
('docs', '#3b82f6'),
('urgent', '#f59e0b'),
('ai-generated', '#a855f7');
