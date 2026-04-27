/**
 * Integration tests for Work Kanban API.
 * Run with: npx tsx src/__tests__/work.integration.test.ts
 * Requires: PostgreSQL with DATABASE_URL, migrations applied (including 005_work_kanban.sql).
 */
import { initDatabaseAndConnect, getDb } from '../database';
import { runRegistryMigrations } from '../db/migrateRegistry';
import { app } from '../app';
import supertest from 'supertest';

const request = supertest(app);

async function setup() {
  await initDatabaseAndConnect();
  await runRegistryMigrations();
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  WORK KANBAN INTEGRATION TESTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  await setup();

  let passed = 0;
  let failed = 0;

  // 1. GET /work/board returns empty columns when no tasks
  try {
    const res = await request.get('/work/board');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = res.body;
    if (!Array.isArray(data.columns)) throw new Error('Missing columns array');
    if (data.columns.length !== 4) throw new Error(`Expected 4 columns, got ${data.columns.length}`);
    const queueCol = data.columns.find((c: { id: string }) => c.id === 'queue');
    if (!queueCol || !Array.isArray(queueCol.items)) throw new Error('Missing queue column or items');
    if (queueCol.items.length > 0) throw new Error('Expected empty queue, got items');
    if (!data.counts || data.counts.total !== 0) throw new Error('Expected counts.total=0');
    console.log('GET /work/board (empty): OK');
    passed++;
  } catch (e: unknown) {
    console.log(`GET /work/board (empty): FAIL - ${e instanceof Error ? e.message : e}`);
    failed++;
  }

  // 2. POST /work/items creates a task
  let createdId: string | null = null;
  try {
    const res = await request
      .post('/work/items')
      .send({ title: 'Test task', priority: 0 });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const item = res.body;
    if (!item.id) throw new Error('Missing id in response');
    if (item.title !== 'Test task') throw new Error('Wrong title');
    if (item.status !== 'queue') throw new Error('Expected status=queue');
    createdId = item.id;
    console.log('POST /work/items: OK');
    passed++;
  } catch (e: unknown) {
    console.log(`POST /work/items: FAIL - ${e instanceof Error ? e.message : e}`);
    failed++;
  }

  // 3. PATCH /work/items/:id updates
  if (createdId) {
    try {
      const res = await request
        .patch(`/work/items/${createdId}`)
        .send({ title: 'Updated task', status: 'ongoing' });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.title !== 'Updated task') throw new Error('Title not updated');
      if (res.body.status !== 'ongoing') throw new Error('Status not updated');
      console.log('PATCH /work/items/:id: OK');
      passed++;
    } catch (e: unknown) {
      console.log(`PATCH /work/items/:id: FAIL - ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  // 4. POST /work/items/:id/move
  if (createdId) {
    try {
      const res = await request
        .post(`/work/items/${createdId}/move`)
        .send({ status: 'completed' });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.status !== 'completed') throw new Error('Status not updated');
      console.log('POST /work/items/:id/move: OK');
      passed++;
    } catch (e: unknown) {
      console.log(`POST /work/items/:id/move: FAIL - ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  // 5. DELETE /work/items/:id
  if (createdId) {
    try {
      const res = await request.delete(`/work/items/${createdId}`);
      if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
      const boardRes = await request.get('/work/board');
      const total = boardRes.body.counts?.total ?? -1;
      if (total !== 0) throw new Error(`Expected 0 items after delete, got ${total}`);
      console.log('DELETE /work/items/:id: OK');
      passed++;
    } catch (e: unknown) {
      console.log(`DELETE /work/items/:id: FAIL - ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  // 6. 404 for non-existent
  try {
    const patchRes = await request
      .patch('/work/items/00000000-0000-0000-0000-000000000000')
      .send({ title: 'x' });
    if (patchRes.status !== 404) throw new Error(`Expected 404 for PATCH, got ${patchRes.status}`);
    const body = patchRes.body;
    if (!body?.error) throw new Error('Expected error in 404 response');
    console.log('404 for non-existent: OK');
    passed++;
  } catch (e: unknown) {
    console.log(`404 for non-existent: FAIL - ${e instanceof Error ? e.message : e}`);
    failed++;
  }

  // Cleanup: delete any test tasks
  try {
    const pool = getDb();
    await pool.query("DELETE FROM work_kanban_items WHERE title LIKE 'Test%' OR title = 'Updated task'");
  } catch {
    // ignore
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
