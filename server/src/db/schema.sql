-- Mission Control Database Schema
-- SQLite

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    agent_id TEXT NOT NULL,
    priority TEXT DEFAULT 'medium',
    tags TEXT, -- JSON array
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    error TEXT
);

-- Tool calls log
CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    input TEXT NOT NULL, -- JSON
    output TEXT, -- JSON
    error TEXT,
    duration_ms INTEGER,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Human reviews (approvals, questions)
CREATE TABLE IF NOT EXISTS human_reviews (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'approval' or 'question'
    status TEXT NOT NULL DEFAULT 'pending',
    message TEXT NOT NULL,
    context TEXT, -- JSON
    response TEXT,
    requested_at TEXT NOT NULL,
    responded_at TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Progress/comments feed
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    author TEXT NOT NULL, -- 'human' or 'agent'
    message TEXT NOT NULL,
    type TEXT DEFAULT 'comment', -- 'comment', 'progress', 'block', 'complete'
    metadata TEXT, -- JSON
    timestamp TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- API keys for agent authentication
CREATE TABLE IF NOT EXISTS api_keys (
    key TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_reviews_task ON human_reviews(task_id);
