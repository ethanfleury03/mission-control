-- Agent Office Schema Additions
-- Add these to your PostgreSQL database

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('sales', 'support', 'marketing', 'developer')),
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'working', 'paused', 'error')),
  avatar TEXT,
  instructions TEXT DEFAULT '',
  session_id TEXT,
  capabilities JSONB DEFAULT '[]',
  working_hours JSONB,
  stats JSONB DEFAULT '{"tasksCompleted": 0, "tasksFailed": 0, "totalWorkTime": 0}'::jsonb,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent tasks
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  priority TEXT DEFAULT 'medium',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  result JSONB,
  error TEXT
);

-- Agent chat history
CREATE TABLE IF NOT EXISTS agent_chat (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  "from" TEXT NOT NULL CHECK ("from" IN ('user', 'agent')),
  message TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_role ON agents(role);
CREATE INDEX idx_agent_tasks_agent ON agent_tasks(agent_id);
CREATE INDEX idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX idx_agent_chat_agent ON agent_chat(agent_id);

-- Seed the 4 default agents
INSERT INTO agents (id, name, role, status, instructions, capabilities, working_hours) VALUES
('sales-1', 'Alex', 'sales', 'idle', 
 'You are a sales specialist. Focus on lead qualification, outreach, and closing deals. Always be professional and persuasive.',
 '["email", "calendar", "web_search", "gog"]'::jsonb,
 NULL),

('support-1', 'Sam', 'support', 'idle',
 'You are a customer support specialist. Be helpful, patient, and solution-oriented. Prioritize customer satisfaction.',
 '["email", "calendar", "web_search", "gog"]'::jsonb,
 '{"start": "09:00", "end": "17:00", "timezone": "America/New_York"}'::jsonb),

('marketing-1', 'Maya', 'marketing', 'idle',
 'You are a marketing specialist. Focus on content creation, campaign management, and market research. Be creative and data-driven.',
 '["web_search", "web_fetch", "browser", "gog"]'::jsonb,
 NULL),

('developer-1', 'Devin', 'developer', 'idle',
 'You are a software developer. Write clean, efficient code. Use best practices and test thoroughly.',
 '["exec", "read", "write", "edit", "browser", "web_search"]'::jsonb,
 NULL)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  instructions = EXCLUDED.instructions,
  capabilities = EXCLUDED.capabilities,
  working_hours = EXCLUDED.working_hours;
