import { execSync } from 'child_process';
import path from 'path';

// Never hit Turso during tests: .env may set TURSO_* for local dev, but Prisma would
// otherwise prefer the LibSQL adapter and return HTTP 400 for this worker's queries.
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const dbPath = path.join(__dirname, 'prisma', 'vitest-directory-scraper.db');
process.env.DATABASE_URL = `file:${dbPath}`;

execSync('npx prisma db push --skip-generate --accept-data-loss', {
  stdio: 'pipe',
  cwd: __dirname,
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
});
