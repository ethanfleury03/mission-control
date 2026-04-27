import { createTables, getDb, initDatabaseAndConnect } from '../src/database';
import { runRegistryMigrations } from '../src/db/migrateRegistry';

const TEST_TEAM_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  await initDatabaseAndConnect();
  await createTables();
  await runRegistryMigrations();

  const db = getDb();
  await db.query(
    `
      INSERT INTO registry_teams (id, name, purpose, status)
      VALUES ($1, 'CI Test Team', 'Seeded for server integration tests', 'active')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          purpose = EXCLUDED.purpose,
          status = EXCLUDED.status
    `,
    [TEST_TEAM_ID],
  );

  console.log('Server CI database setup completed');
  await db.end();
}

main().catch((err) => {
  console.error('Server CI database setup failed:', err);
  process.exit(1);
});
