/**
 * Work Orchestration Integration Tests
 * Tests: idempotency, SKIP LOCKED, state machine transitions
 */

import { Pool } from 'pg';
import { WorkService } from '../service';
import { WorkRepository } from '../repository';

// Test database connection
const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/missioncontrol';

async function withTestDb<T>(fn: (db: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({
    connectionString: TEST_DB_URL,
    ssl: false
  });
  try {
    await pool.query('TRUNCATE work_events, work_items RESTART IDENTITY CASCADE');
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

// Test 1: Idempotency - same key returns existing item
async function testIdempotency(): Promise<{ passed: boolean; error?: string }> {
  return withTestDb(async (db) => {
    const service = new WorkService(db);
    const idempotencyKey = `test-${Date.now()}`;
    
    // Create first work item
    const first = await service.createWorkItem({
      team_id: '00000000-0000-0000-0000-000000000001', // Assumes test team exists
      input: { task: 'test' },
      idempotency_key: idempotencyKey
    });
    
    // Create second with same key
    const second = await service.createWorkItem({
      team_id: '00000000-0000-0000-0000-000000000001',
      input: { task: 'different' }, // Different input, same key
      idempotency_key: idempotencyKey
    });
    
    // Should return same ID
    if (first.id !== second.id) {
      return { passed: false, error: `Expected same ID, got ${first.id} and ${second.id}` };
    }
    
    return { passed: true };
  });
}

// Test 2: SKIP LOCKED prevents double-claim
async function testSkipLocked(): Promise<{ passed: boolean; error?: string }> {
  return withTestDb(async (db) => {
    const repo = new WorkRepository(db);
    
    // Create test work items
    await Promise.all([
      db.query(`INSERT INTO work_items (team_id, input, status, requested_by_type)
        VALUES ('00000000-0000-0000-0000-000000000001', '{}', 'queued', 'system') RETURNING id`),
      db.query(`INSERT INTO work_items (team_id, input, status, requested_by_type)
        VALUES ('00000000-0000-0000-0000-000000000001', '{}', 'queued', 'system') RETURNING id`)
    ]);
    
    // Simulate concurrent claims from two workers
    const [claim1, claim2] = await Promise.all([
      repo.claimNextWorkItems('worker-1', 2),
      repo.claimNextWorkItems('worker-2', 2)
    ]);
    
    // Total claimed should be exactly 2 (not 4)
    const totalClaimed = claim1.length + claim2.length;
    if (totalClaimed !== 2) {
      return { passed: false, error: `Expected 2 claimed total, got ${totalClaimed}` };
    }
    
    // No overlap in claimed items
    const ids1 = new Set(claim1.map(i => i.id));
    const ids2 = new Set(claim2.map(i => i.id));
    const overlap = [...ids1].filter(id => ids2.has(id));
    if (overlap.length > 0) {
      return { passed: false, error: `Overlap detected: ${overlap.join(', ')}` };
    }
    
    return { passed: true };
  });
}

// Test 3: Invalid status transition returns error
async function testInvalidTransition(): Promise<{ passed: boolean; error?: string }> {
  return withTestDb(async (db) => {
    const service = new WorkService(db);
    
    // Create work item
    const item = await service.createWorkItem({
      team_id: '00000000-0000-0000-0000-000000000001',
      input: { task: 'test' }
    });
    
    // Try invalid transition: queued -> done (must go through claimed, working)
    try {
      await service.transitionStatus(item.id, 'done', 'system', 'test');
      return { passed: false, error: 'Should have thrown for invalid transition' };
    } catch (err: any) {
      if (!err.message.includes('Invalid status transition')) {
        return { passed: false, error: `Wrong error message: ${err.message}` };
      }
      return { passed: true };
    }
  });
}

// Test 4: Valid status transitions work
async function testValidTransitions(): Promise<{ passed: boolean; error?: string }> {
  return withTestDb(async (db) => {
    const service = new WorkService(db);
    const repo = new WorkRepository(db);
    
    // Create work item
    const item = await service.createWorkItem({
      team_id: '00000000-0000-0000-0000-000000000001',
      input: { task: 'test' }
    });
    
    // queued -> claimed (via claim)
    const claimed = await repo.claimNextWorkItems('test-worker', 1);
    if (claimed.length !== 1 || claimed[0].status !== 'claimed') {
      return { passed: false, error: 'Failed to claim' };
    }
    
    // claimed -> working
    const working = await service.transitionStatus(item.id, 'working', 'system', 'test');
    if (working.status !== 'working') {
      return { passed: false, error: `Expected working, got ${working.status}` };
    }
    
    // working -> done
    const done = await service.transitionStatus(item.id, 'done', 'system', 'test');
    if (done.status !== 'done') {
      return { passed: false, error: `Expected done, got ${done.status}` };
    }
    
    return { passed: true };
  });
}

// Test 5: Max attempts exceeded prevents retry
async function testMaxAttempts(): Promise<{ passed: boolean; error?: string }> {
  return withTestDb(async (db) => {
    const service = new WorkService(db);
    const repo = new WorkRepository(db);
    
    // Create work item with max_attempts = 1
    const result = await db.query(
      `INSERT INTO work_items (team_id, input, status, requested_by_type, max_attempts, attempt_count)
       VALUES ('00000000-0000-0000-0000-000000000001', '{}', 'failed', 'system', 1, 1)
       RETURNING id`
    );
    const itemId = result.rows[0].id;
    
    // Try to transition failed -> queued (retry)
    try {
      await service.transitionStatus(itemId, 'queued', 'system', 'test');
      return { passed: false, error: 'Should have thrown for max attempts exceeded' };
    } catch (err: any) {
      if (!err.message.includes('max attempts')) {
        return { passed: false, error: `Wrong error: ${err.message}` };
      }
      return { passed: true };
    }
  });
}

// Run all tests
async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  WORK ORCHESTRATION MVP INTEGRATION TESTS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const tests = [
    { name: 'Idempotency (same key returns existing)', fn: testIdempotency },
    { name: 'SKIP LOCKED prevents double-claim', fn: testSkipLocked },
    { name: 'Invalid status transition rejected', fn: testInvalidTransition },
    { name: 'Valid status transitions work', fn: testValidTransitions },
    { name: 'Max attempts prevents retry', fn: testMaxAttempts }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    process.stdout.write(`${test.name}... `);
    try {
      const result = await test.fn();
      if (result.passed) {
        console.log('✓ PASS');
        passed++;
      } else {
        console.log(`✗ FAIL: ${result.error}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`✗ ERROR: ${err.message}`);
      failed++;
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  runTests();
}

export { testIdempotency, testSkipLocked, testInvalidTransition, testValidTransitions, testMaxAttempts };
