import dotenv from 'dotenv';
import { Pool } from 'pg';

// Ensure env is loaded before any DB access (routes may import getDb before server.ts runs dotenv.config)
dotenv.config();

let pool: Pool | null = null;

function ensurePool(): Pool {
  if (pool) return pool;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.trim() === '') {
    throw new Error('DATABASE_URL is required. No silent fallback to SQLite or JSON.');
  }
  if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must start with postgres:// or postgresql://');
  }

  let url: URL;
  try {
    url = new URL(dbUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }

  const sslmode =
    url.searchParams.get('sslmode') || process.env.PGSSLMODE || '';
  const sslParam = url.searchParams.get('ssl');

  const sslModesRequiringSSL = ['require', 'verify-ca', 'verify-full'];
  let wantsSSL =
    sslModesRequiringSSL.includes(sslmode.toLowerCase()) ||
    sslParam === 'true';

  if (
    !sslmode &&
    !sslParam &&
    (url.hostname === 'postgres' || url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  ) {
    wantsSSL = false;
  }

  const sslConfig = wantsSSL
    ? {
        rejectUnauthorized: process.env.PGSSLREJECTUNAUTHORIZED !== '0',
      }
    : false;

  // Cloud SQL on Cloud Run: DATABASE_URL uses ?host=/cloudsql/PROJECT:REGION:INSTANCE
  // which `pg`'s connectionString parser does not consistently translate into the unix
  // socket path. Build an explicit config when we detect that shape.
  const hostOverride = url.searchParams.get('host');
  const isUnixSocket = !!hostOverride && hostOverride.startsWith('/');

  if (isUnixSocket) {
    pool = new Pool({
      host: hostOverride,
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl: false,
    });
  } else {
    pool = new Pool({
      connectionString: dbUrl,
      ssl: sslConfig,
    });
  }

  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err);
  });

  return pool;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTimestamp(value?: string): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeRowTimestamps(row: Record<string, any>, keys: string[]): Record<string, any> {
  const normalized = { ...row };
  for (const key of keys) {
    const value = normalized[key];
    if (value instanceof Date) {
      normalized[key] = value.toISOString();
    }
  }
  return normalized;
}

export function initDatabase(): Pool {
  return ensurePool();
}

export async function initDatabaseAndConnect(): Promise<void> {
  const p = ensurePool();
  await p.query('SELECT 1');
}

export function getDb(): Pool {
  return ensurePool();
}

/**
 * Execute a function within a database transaction.
 * Client is passed to the callback; ROLLBACK on throw, COMMIT on success.
 */
export async function withTransaction<T>(
  fn: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const client = await ensurePool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createTables(): Promise<void> {
  const db = getDb();
  
  const queries = [
    `CREATE TABLE IF NOT EXISTS tasks (
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
    )`,
    
    `CREATE TABLE IF NOT EXISTS task_progress (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      message TEXT,
      metadata JSONB DEFAULT '{}',
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      tool TEXT,
      input JSONB DEFAULT '{}',
      output JSONB,
      error TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      duration_ms INTEGER DEFAULT 0
    )`,
    
    `CREATE TABLE IF NOT EXISTS human_reviews (
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
    )`,
    
    `CREATE TABLE IF NOT EXISTS api_keys (
      key TEXT PRIMARY KEY,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // Indexes for performance
    `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_progress_task ON task_progress(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reviews_task ON human_reviews(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id)`
  ];
  
  for (const query of queries) {
    await db.query(query);
  }
  
  console.log('PostgreSQL tables created');
}

// Task operations
export async function createTask(task: any): Promise<any> {
  const db = getDb();
  const id = generateId('task');
  
  const result = await db.query(
    `INSERT INTO tasks (id, title, description, status, agent_id, priority, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, task.title, task.description, task.status || 'pending', 
     task.agentId, task.priority || 'medium', JSON.stringify(task.tags || [])]
  );
  
  return normalizeRowTimestamps(result.rows[0], ['created_at', 'updated_at', 'completed_at']);
}

export async function getTask(id: string): Promise<any> {
  const db = getDb();
  const result = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
  const row = result.rows[0];
  return row ? normalizeRowTimestamps(row, ['created_at', 'updated_at', 'completed_at']) : null;
}

export async function getTasks(filters?: any): Promise<any[]> {
  const db = getDb();
  let sql = 'SELECT * FROM tasks';
  const params: any[] = [];
  
  if (filters?.status) {
    sql += ' WHERE status = $1';
    params.push(filters.status);
  }
  
  sql += ' ORDER BY updated_at DESC';
  
  if (filters?.limit) {
    sql += ` LIMIT $${params.length + 1}`;
    params.push(parseInt(filters.limit));
  }
  
  const result = await db.query(sql, params);
  return result.rows.map((row) =>
    normalizeRowTimestamps(row, ['created_at', 'updated_at', 'completed_at'])
  );
}

export async function updateTaskStatus(id: string, status: string): Promise<void> {
  const db = getDb();
  const completedAt = (status === 'completed' || status === 'failed') ? 'CURRENT_TIMESTAMP' : null;
  
  await db.query(
    `UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP, 
     completed_at = ${completedAt ? completedAt : 'NULL'} 
     WHERE id = $2`,
    [status, id]
  );
}

export async function touchTask(id: string): Promise<void> {
  const db = getDb();
  await db.query(
    `UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id]
  );
}

export async function addProgress(taskId: string, progress: any): Promise<void> {
  const db = getDb();
  const id = generateId('prog');
  
  await db.query(
    `INSERT INTO task_progress (id, task_id, message, metadata, timestamp)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      taskId,
      progress.message,
      JSON.stringify(progress.metadata || {}),
      normalizeTimestamp(progress.timestamp)
    ]
  );
}

export async function getProgress(taskId: string): Promise<any[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT * FROM task_progress WHERE task_id = $1 ORDER BY timestamp ASC`,
    [taskId]
  );
  return result.rows.map((row) => normalizeRowTimestamps(row, ['timestamp']));
}

export async function addToolCall(taskId: string, toolCall: any): Promise<void> {
  const db = getDb();
  const id = toolCall.id || generateId('tc');
  
  await db.query(
    `INSERT INTO tool_calls (id, task_id, tool, input, output, error, timestamp, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id, taskId, toolCall.tool, 
      JSON.stringify(toolCall.input), 
      toolCall.output ? JSON.stringify(toolCall.output) : null,
      toolCall.error || null,
      normalizeTimestamp(toolCall.timestamp),
      toolCall.durationMs || 0
    ]
  );
}

export async function getToolCalls(taskId: string): Promise<any[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT * FROM tool_calls WHERE task_id = $1 ORDER BY timestamp ASC`,
    [taskId]
  );
  return result.rows.map((row) => normalizeRowTimestamps(row, ['timestamp']));
}

export async function createReview(taskId: string, review: any): Promise<void> {
  const db = getDb();
  const id = generateId('rev');
  
  await db.query(
    `INSERT INTO human_reviews (id, task_id, review_id, type, message, status, context, requested_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, taskId, review.reviewId, review.type, review.message, 'pending',
     JSON.stringify(review.context || {}), normalizeTimestamp(review.timestamp)]
  );
}

export async function getReviews(taskId: string): Promise<any[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT * FROM human_reviews WHERE task_id = $1 ORDER BY requested_at ASC`,
    [taskId]
  );
  return result.rows.map((row) =>
    normalizeRowTimestamps(row, ['requested_at', 'responded_at'])
  );
}

export async function respondToReview(reviewId: string, response: any): Promise<void> {
  const db = getDb();
  
  await db.query(
    `UPDATE human_reviews 
     SET status = $1, response = $2, responded_at = CURRENT_TIMESTAMP
     WHERE review_id = $3`,
    [
      response.approved ? 'approved' : response.response ? 'answered' : 'rejected',
      response.response || null,
      reviewId
    ]
  );
}

export async function validateApiKey(key: string): Promise<boolean> {
  const db = getDb();
  const result = await db.query('SELECT key FROM api_keys WHERE key = $1', [key]);
  return result.rows.length > 0;
}

export async function seedInitialData(): Promise<void> {
  const db = getDb();
  
  // Insert test API key
  await db.query(
    `INSERT INTO api_keys (key, name) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
    ['test-key', 'Test Key']
  );

  const existing = await db.query('SELECT COUNT(*)::int AS count FROM tasks');
  if (existing.rows[0]?.count > 0) {
    return;
  }

  const seedTasks = [
    {
      title: 'Integrate Lucid Chart',
      description: 'Build integration with Lucid Chart for diagram generation'
    },
    {
      title: 'Integrate HubSpot',
      description: 'Connect to HubSpot CRM for contact management'
    },
    {
      title: 'Integrate ZoomInfo',
      description: 'Build integration with ZoomInfo for lead enrichment'
    }
  ];

  for (const task of seedTasks) {
    await db.query(
      `INSERT INTO tasks (id, title, description, status, priority, tags)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        generateId('task'),
        task.title,
        task.description,
        'pending',
        'high',
        JSON.stringify(['integration'])
      ]
    );
  }

  console.log('Initial data seeded');
}
