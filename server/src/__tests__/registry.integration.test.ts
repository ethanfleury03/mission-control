/**
 * Integration tests for Agent Teams Registry.
 * Run with: npx tsx src/__tests__/registry.integration.test.ts
 * Requires: PostgreSQL with DATABASE_URL, migrations applied.
 */
import { initDatabase, getDb } from '../database';
import { runRegistryMigrations } from '../db/migrateRegistry';
import { RegistryService } from '../registry';
import { resolveToolPolicy, resolveDataAccessPolicy } from '../registry/policyResolver';
import { RegistryRepository } from '../registry';

async function setup() {
  initDatabase();
  await runRegistryMigrations();
}

async function testAgentCrud() {
  const registry = new RegistryService();
  const agent = await registry.createAgent({
    name: `TestAgent_${Date.now()}`,
    model: 'gpt-4',
    runtime: 'gpt-4',
    primary_team_id: null,
  });
  console.assert(agent.id, 'Agent created with id');
  console.assert(agent.version === 1, 'Version is 1');

  const fetched = await registry.getAgent(agent.id);
  console.assert(fetched?.name === agent.name, 'Agent fetched');

  const updated = await registry.updateAgent(agent.id, { model: 'claude' });
  console.assert(updated?.model === 'claude', 'Agent updated');
  console.assert(updated?.version === 2, 'Version incremented');

  await registry.updateAgent(agent.id, { is_active: false });
  console.log('Agent CRUD: OK');
}

async function testOptimisticLocking() {
  const registry = new RegistryService();
  const agent = await registry.createAgent({
    name: `LockAgent_${Date.now()}`,
    model: 'gpt-4',
    runtime: 'gpt-4',
  });

  await registry.updateAgent(agent.id, { model: 'v1' }, 1);
  const updated = await registry.getAgent(agent.id);
  console.assert(updated?.model === 'v1', 'First update');

  try {
    await registry.updateAgent(agent.id, { model: 'v2' }, 1);
    throw new Error('Expected conflict');
  } catch (e: any) {
    console.assert(e.message?.includes('Conflict'), '409 on version mismatch');
  }
  console.log('Optimistic locking: OK');
}

async function testTeamStatusTransition() {
  const registry = new RegistryService();
  const team = await registry.createTeam({ name: `StatusTeam_${Date.now()}`, purpose: 'test' });
  const agent = await registry.createAgent({
    name: `Manager_${Date.now()}`,
    model: 'gpt-4',
    runtime: 'gpt-4',
  });
  await registry.addTeamManager(team.id, agent.id, 0);
  await registry.setTeamStatus(team.id, 'active', team.version);

  let paused = await registry.setTeamStatus(team.id, 'paused', 2);
  console.assert(paused?.status === 'paused', 'Active -> Paused');

  const reactivated = await registry.setTeamStatus(team.id, 'active', paused!.version);
  console.assert(reactivated?.status === 'active', 'Paused -> Active');

  const archived = await registry.setTeamStatus(team.id, 'archived', reactivated!.version);
  try {
    await registry.setTeamStatus(team.id, 'active', archived!.version);
    throw new Error('Expected invalid transition');
  } catch (e: any) {
    console.assert(e.message?.includes('Invalid'), 'Archived -> Active rejected');
  }
  console.log('Team status transitions: OK');
}

async function testPolicyResolution() {
  const repo = new RegistryRepository(getDb());
  const agent = await repo.createAgent({
    name: `PolicyAgent_${Date.now()}`,
    model: 'gpt-4',
    runtime: 'gpt-4',
  });
  const team = await repo.createTeam({
    name: `PolicyTeam_${Date.now()}`,
    purpose: 'test',
  });

  await repo.upsertToolPolicy({
    scope_type: 'global',
    scope_id: null,
    tool_name: 'search',
    permission: 'execute',
  });
  await repo.upsertToolPolicy({
    scope_type: 'agent',
    scope_id: agent.id,
    tool_name: 'search',
    permission: 'deny',
  });

  const policy = await resolveToolPolicy(repo, agent.id, team.id, 'search');
  console.assert(policy.permission === 'deny', 'Agent override wins');
  console.assert(policy.source === 'agent', 'Source is agent');

  const globalPolicy = await resolveToolPolicy(repo, agent.id, team.id, 'other_tool');
  console.assert(globalPolicy.permission === 'execute' || globalPolicy.permission === 'deny', 'Global fallback');
  console.log('Policy resolution: OK');
}

async function testAuditWritten() {
  const registry = new RegistryService();
  const agent = await registry.createAgent({
    name: `AuditAgent_${Date.now()}`,
    model: 'gpt-4',
    runtime: 'gpt-4',
  });

  const { rows } = await registry.listAudit({ entity_type: 'agent', entity_id: agent.id, limit: 5 });
  console.assert(rows.length >= 1, 'Audit entry written');
  const first = rows[0] as { action?: string } | undefined;
  console.assert(first?.action === 'AGENT_CREATED', 'Audit has correct action');
  console.log('Audit log: OK');
}

async function main() {
  try {
    await setup();
    await testAgentCrud();
    await testOptimisticLocking();
    await testTeamStatusTransition();
    await testPolicyResolution();
    await testAuditWritten();
    console.log('All integration tests passed');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
  process.exit(0);
}

main();
