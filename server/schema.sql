-- PostgreSQL Schema for Mission Control
-- Run this if you need to manually create tables

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  agent_id TEXT,
  priority TEXT DEFAULT 'medium',
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Progress log
CREATE TABLE IF NOT EXISTS task_progress (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  message TEXT,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tool call logs
CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  tool TEXT,
  input JSONB DEFAULT '{}',
  output JSONB,
  error TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  duration_ms INTEGER DEFAULT 0
);

-- Human review requests
CREATE TABLE IF NOT EXISTS human_reviews (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  review_id TEXT UNIQUE,
  type TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending',
  context JSONB DEFAULT '{}',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP,
  response TEXT
);

-- API authentication
CREATE TABLE IF NOT EXISTS api_keys (
  key TEXT PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_progress_task ON task_progress(task_id);
CREATE INDEX IF NOT EXISTS idx_reviews_task ON human_reviews(task_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);

-- Insert test API key
INSERT INTO api_keys (key, name) VALUES ('test-key', 'Test Key')
ON CONFLICT (key) DO NOTHING;
