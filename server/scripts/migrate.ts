import { createTables, initDatabaseAndConnect } from '../src/database';
import { runRegistryMigrations } from '../src/db/migrateRegistry';

async function main() {
  await initDatabaseAndConnect();
  await createTables();
  await runRegistryMigrations();
  console.log('Server database migrations completed');
}

main().catch((err) => {
  console.error('Server database migration failed:', err);
  process.exit(1);
});
