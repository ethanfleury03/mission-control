/**
 * Fails fast with a clear fix if node_modules is missing (fresh clone) or
 * out of date (e.g. "Can't resolve 'next-auth'" when running `npm run dev`).
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const required = [
  'node_modules/next',
  'node_modules/next-auth',
  'node_modules/react',
  'node_modules/@prisma/client',
];
const missing = required.filter((p) => !fs.existsSync(path.join(root, p)));

if (missing.length) {
  console.error('\n[mission-control] Dependencies are missing or incomplete.\n');
  console.error('  Missing (expected paths):', missing.map((m) => m.replace('node_modules/', '')).join(', '));
  console.error('\n  From the repo root, run:  npm install\n');
  process.exit(1);
}
