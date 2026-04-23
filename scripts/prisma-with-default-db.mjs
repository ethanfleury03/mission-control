#!/usr/bin/env node
/**
 * Prisma CLI reads DATABASE_URL only from the environment — it does not load .env
 * automatically. The Next.js app defaults missing DATABASE_URL to file:./dev.db in
 * lib/prisma.ts; this script applies the same default so `npm run db:*` works after
 * a fresh clone without copying .env first.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = { ...process.env };
if (!env.DATABASE_URL?.trim()) {
  env.DATABASE_URL = 'file:./dev.db';
}

const args = process.argv.slice(2);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');

const result = spawnSync(process.execPath, [prismaCli, ...args], {
  cwd: root,
  stdio: 'inherit',
  env,
});

process.exit(result.status === null ? 1 : result.status);
