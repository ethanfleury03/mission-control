import { execSync } from 'child_process';
import path from 'path';

const dbPath = path.join(__dirname, 'prisma', 'vitest-directory-scraper.db');
process.env.DATABASE_URL = `file:${dbPath}`;

execSync('npx prisma db push --skip-generate --accept-data-loss', {
  stdio: 'pipe',
  cwd: __dirname,
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
});
