#!/usr/bin/env node
/**
 * Regression check: Block SQLite from production.
 * Run: node scripts/check-no-sqlite.js
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');
let failed = false;

function walk(dir) {
  const results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && file !== 'node_modules') {
      results.push(...walk(filePath));
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      results.push(filePath);
    }
  }
  return results;
}

for (const file of walk(srcDir)) {
  const content = fs.readFileSync(file, 'utf-8');
  if (content.includes('better-sqlite3')) {
    console.error(`FAIL: ${path.relative(srcDir, file)} imports better-sqlite3`);
    failed = true;
  }
  if (content.includes("from './db'") || content.includes("from '../db'")) {
    console.error(`FAIL: ${path.relative(srcDir, file)} imports old sqlite db module`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log('OK: No SQLite imports in production src');
process.exit(0);
