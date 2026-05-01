import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

import { getDatabaseUrlStatus } from '../lib/rag/config';
import { loadLocalEnv } from './rag-env';

async function main() {
  loadLocalEnv();
  const database = getDatabaseUrlStatus();
  if (!database.isPostgres) throw new Error(database.message);

  const migrationPath = path.join(process.cwd(), 'database/migrations/20260429_rag_support.sql');
  const sql = await fs.readFile(migrationPath, 'utf8');
  const pool = new Pool({ connectionString: database.value });
  try {
    await pool.query(sql);
    console.log(`Applied RAG migration: ${migrationPath}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
