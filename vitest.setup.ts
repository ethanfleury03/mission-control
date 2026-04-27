import { execSync } from 'child_process';

const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!testDatabaseUrl?.startsWith('postgres://') && !testDatabaseUrl?.startsWith('postgresql://')) {
  throw new Error(
    'Vitest now requires TEST_DATABASE_URL or DATABASE_URL to point at a disposable PostgreSQL database.',
  );
}

process.env.DATABASE_URL = testDatabaseUrl;

execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
  stdio: 'pipe',
  cwd: __dirname,
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
});
