const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'data', 'mission-control.db'));

const now = new Date().toISOString();

// Create tables first
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    agent_id TEXT,
    priority TEXT DEFAULT 'medium',
    tags TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  );
  
  CREATE TABLE IF NOT EXISTS task_progress (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    message TEXT,
    metadata TEXT,
    timestamp TEXT
  );
  
  CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    tool TEXT,
    input TEXT,
    output TEXT,
    error TEXT,
    timestamp TEXT,
    duration_ms INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS human_reviews (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    review_id TEXT,
    type TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending',
    context TEXT,
    requested_at TEXT,
    responded_at TEXT,
    response TEXT
  );
  
  CREATE TABLE IF NOT EXISTS api_keys (
    key TEXT PRIMARY KEY,
    name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insert API key
db.run(`INSERT OR IGNORE INTO api_keys (key, name) VALUES (?, ?)`, ['test-key', 'Test Key']);

// Insert sample tasks
const tasks = [
  {
    id: 'task_1',
    title: 'Check morning emails',
    desc: 'Process unread emails from shaan@arrsys.com',
    status: 'completed',
    agent: 'sasha-1'
  },
  {
    id: 'task_2', 
    title: 'Generate daily report',
    desc: 'Compile metrics from yesterday',
    status: 'in_progress',
    agent: 'sasha-1'
  },
  {
    id: 'task_3',
    title: 'Send customer follow-up',
    desc: 'Email customers about pending orders',
    status: 'need_review',
    agent: 'sasha-1'
  },
  {
    id: 'task_4',
    title: 'Research competitor pricing',
    desc: 'Check pricing on competitor websites',
    status: 'pending',
    agent: 'sasha-1'
  }
];

tasks.forEach(t => {
  db.run(
    `INSERT OR REPLACE INTO tasks (id, title, description, status, agent_id, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [t.id, t.title, t.desc, t.status, t.agent, 'medium', now, now]
  );
});

// Add some progress messages
db.run(
  `INSERT INTO task_progress (id, task_id, message, metadata, timestamp)
   VALUES (?, ?, ?, ?, ?)`,
  ['prog_1', 'task_2', 'Fetching data from database...', '{}', now]
);

db.run(
  `INSERT INTO task_progress (id, task_id, message, metadata, timestamp)
   VALUES (?, ?, ?, ?, ?)`,
  ['prog_2', 'task_2', 'Processing metrics...', '{}', now]
);

// Add a tool call
db.run(
  `INSERT INTO tool_calls (id, task_id, tool, input, output, timestamp, duration_ms)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ['tc_1', 'task_2', 'database', '{"query": "SELECT * FROM metrics"}', '{"rows": 42}', now, 150]
);

// Add a review request
db.run(
  `INSERT INTO human_reviews (id, task_id, review_id, type, message, status, context, requested_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ['rev_1', 'task_3', 'rv_123', 'approval', 
   'Need approval to send email to external domain (example.com)', 
   'pending', '{"domain": "example.com"}', now]
);

console.log('Database seeded with 4 tasks!');
db.close();
