#!/usr/bin/env node
/**
 * Remove .next so the next dev/build picks up a fresh webpack graph.
 * Fixes 404s on /_next/static/chunks/*.js after git pull or interrupted builds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextDir = path.join(root, '.next');

if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  // eslint-disable-next-line no-console
  console.log('Removed .next');
} else {
  // eslint-disable-next-line no-console
  console.log('No .next folder to remove');
}
