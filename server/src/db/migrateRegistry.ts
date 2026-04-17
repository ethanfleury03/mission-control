import fs from 'fs';
import path from 'path';
import { getDb } from '../database';

const ADVISORY_LOCK_KEY = 0x7265676973747279; // 'registry' in hex

/** Postgres duplicate DDL — safe to skip only if we ROLLBACK TO SAVEPOINT (catching alone aborts the txn). */
const IGNORABLE_DDL_ERROR_CODES = new Set(['42P07', '42710']);

/**
 * Split SQL file into statements, respecting $$...$$ blocks
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;
  const len = sql.length;

  for (let i = 0; i < len; i++) {
    if (sql.substr(i, 2) === '$$') {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i++;
      continue;
    }
    if (sql[i] === ';' && !inDollarQuote) {
      current += ';';
      const raw = current.trim();
      // Strip leading comment lines so "Comment\nCREATE TABLE..." is not skipped
      const stmt = raw.replace(/^(\s*--[^\n]*\n)*\s*/, '').trim();
      if (stmt) {
        statements.push(stmt);
      }
      current = '';
      continue;
    }
    current += sql[i];
  }
  const raw = current.trim();
  const remainder = raw.replace(/^(\s*--[^\n]*\n)*\s*/, '').trim();
  if (remainder) {
    statements.push(remainder);
  }
  return statements;
}

/**
 * Run registry migrations with advisory lock (multi-instance safe).
 * Only one instance obtains the lock; others wait or skip.
 * Tracks applied migrations in registry_migrations for idempotency.
 */
export async function runRegistryMigrations(): Promise<void> {
  const pool = getDb();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [ADVISORY_LOCK_KEY]
    );
    const acquired = lockResult.rows[0]?.acquired;

    if (!acquired) {
      await client.query('ROLLBACK');
      console.log('Registry migrations: another instance holds lock, skipping');
      return;
    }

    await ensureMigrationsTable(client);

    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(
        `Migrations directory not found: ${migrationsDir}. ` +
          'Ensure Dockerfile copies src/db/migrations to ./dist/db/migrations in the final image.'
      );
    }
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    let savepointId = 0;
    for (const file of files) {
      const applied = await isMigrationApplied(client, file);
      if (applied) continue;

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      const statements = splitSqlStatements(sql);

      for (const stmt of statements) {
        if (!stmt.trim()) continue;
        const sp = `mreg_${++savepointId}`;
        try {
          await client.query(`SAVEPOINT ${sp}`);
          await client.query(stmt);
          await client.query(`RELEASE SAVEPOINT ${sp}`);
        } catch (err: any) {
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          if (IGNORABLE_DDL_ERROR_CODES.has(err.code)) {
            continue;
          }
          console.error(`Migration error in ${file}:`, err.message);
          await client.query('ROLLBACK');
          throw err;
        }
      }

      await recordMigration(client, file);
      console.log(`Registry migration applied: ${file}`);
    }

    await client.query('COMMIT');
    console.log('Registry migrations completed');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    client.release();
  }
}

async function ensureMigrationsTable(client: import('pg').PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS registry_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function isMigrationApplied(client: import('pg').PoolClient, name: string): Promise<boolean> {
  const r = await client.query(
    'SELECT 1 FROM registry_migrations WHERE name = $1',
    [name]
  );
  return r.rows.length > 0;
}

async function recordMigration(client: import('pg').PoolClient, name: string): Promise<void> {
  await client.query(
    'INSERT INTO registry_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
    [name]
  );
}
