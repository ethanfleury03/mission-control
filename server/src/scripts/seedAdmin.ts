/**
 * Admin seed script: registry (from JSON), org, policies.
 * Run: npm run seed
 * Requires DATABASE_URL. Idempotent.
 */

import 'dotenv/config';
import { initDatabaseAndConnect, getDb } from '../database';
import { runRegistryMigrations } from '../db/migrateRegistry';
import { seedRegistryFromJsonIfEmpty } from '../registry/seedFromJson';
import { seedOrgFromStaticIfEmpty } from '../org/seedFromStatic';
import { seedPoliciesIfEmpty } from '../db/seedPolicies';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl?.startsWith('postgres')) {
    console.error('DATABASE_URL must be a PostgreSQL URL');
    process.exit(1);
  }

  await initDatabaseAndConnect();
  const pool = getDb();

  try {
    await pool.query('SELECT 1');
  } catch (err: any) {
    console.error('Database unreachable:', err.message);
    process.exit(1);
  }

  console.log('Running registry migrations...');
  await runRegistryMigrations();

  console.log('Seeding registry from JSON...');
  await seedRegistryFromJsonIfEmpty();

  console.log('Seeding org chart...');
  await seedOrgFromStaticIfEmpty();

  console.log('Seeding policies...');
  await seedPoliciesIfEmpty();

  console.log('✅ Admin seed complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
