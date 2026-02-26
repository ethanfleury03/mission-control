import fs from 'fs/promises';
import path from 'path';
import { getDb } from '../database';
import { RegistryRepository } from './repository';
import { importFromJson } from './importExport';

const DATA_DIR = path.join(process.cwd(), 'data');
const AGENTS_PATH = path.join(DATA_DIR, 'agents.json');
const TEAMS_PATH = path.join(DATA_DIR, 'teams.json');
const SEED_ADVISORY_LOCK_KEY = 0x7265676973747279 + 1; // registry + 1

/**
 * Seed registry from existing JSON files if registry is empty.
 * Run after migrations.
 *
 * Gated: only runs when NODE_ENV !== "production" OR REGISTRY_SEED_FROM_JSON=true.
 * Logs loudly when seeding. Never runs in production unless explicitly enabled.
 */
export async function seedRegistryFromJsonIfEmpty(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const seedExplicitlyEnabled = process.env.REGISTRY_SEED_FROM_JSON === 'true';

  if (isProduction && !seedExplicitlyEnabled) {
    return;
  }

  const repo = new RegistryRepository(getDb());
  const [teams, agents] = await Promise.all([
    repo.listTeams(),
    repo.listAgents(),
  ]);

  if (teams.length > 0 || agents.length > 0) {
    return;
  }

  console.warn('[REGISTRY] Seeding from JSON: registry is empty, attempting import from data/*.json');

  const client = await getDb().connect();
  try {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [SEED_ADVISORY_LOCK_KEY]
    );
    if (!lockResult.rows[0]?.acquired) {
      client.release();
      return;
    }

    const [teamsAgain, agentsAgain] = await Promise.all([
      client.query('SELECT 1 FROM registry_teams LIMIT 1'),
      client.query('SELECT 1 FROM registry_agents LIMIT 1'),
    ]);
    if (teamsAgain.rows.length > 0 || agentsAgain.rows.length > 0) {
      await client.query('SELECT pg_advisory_unlock($1)', [SEED_ADVISORY_LOCK_KEY]);
      client.release();
      return;
    }

    const [agentsBuf, teamsBuf] = await Promise.all([
      fs.readFile(AGENTS_PATH, 'utf-8').catch(() => null),
      fs.readFile(TEAMS_PATH, 'utf-8').catch(() => null),
    ]);

    if (!agentsBuf || !teamsBuf) {
      await client.query('SELECT pg_advisory_unlock($1)', [SEED_ADVISORY_LOCK_KEY]);
      client.release();
      return;
    }

    const agentsJson = JSON.parse(agentsBuf) as { agents: import('./importExport').JsonAgent[] };
    const teamsJson = JSON.parse(teamsBuf) as { teams: import('./importExport').JsonTeam[] };

    if (!agentsJson?.agents?.length && !teamsJson?.teams?.length) {
      await client.query('SELECT pg_advisory_unlock($1)', [SEED_ADVISORY_LOCK_KEY]);
      client.release();
      return;
    }

    const { agentsCreated, teamsCreated } = await importFromJson(
      repo,
      agentsJson,
      teamsJson
    );

    console.warn(
      `[REGISTRY] SEED COMPLETE: imported ${agentsCreated} agents, ${teamsCreated} teams from data/*.json. ` +
      'Disable in production by not setting REGISTRY_SEED_FROM_JSON.'
    );
  } catch (err) {
    console.error('[REGISTRY] Seed from JSON failed:', err);
    throw err;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [SEED_ADVISORY_LOCK_KEY]);
    } catch {
      /* ignore */
    }
    client.release();
  }
}
