import { spawnSync } from 'node:child_process';

import { collectRagHealth } from '../lib/rag/health';
import { loadLocalEnv } from './rag-env';

async function main() {
  loadLocalEnv();
  console.log('RAG setup: checking local Postgres/pgvector prerequisites...');
  let health = await collectRagHealth();

  if (!health.databaseUrl.present || !health.databaseUrl.isPostgres) {
    console.log(health.checks.find((check) => check.name === 'DATABASE_URL')?.message || 'DATABASE_URL is not PostgreSQL.');
    console.log('');
    console.log('Use this local value in .env, then restart the dev server:');
    console.log('DATABASE_URL="postgresql://mcapp:mcapp@localhost:5432/missioncontrol_app"');
    process.exit(1);
  }

  const dbConnected = health.checks.find((check) => check.name === 'Database connection')?.ok;
  if (!dbConnected) {
    console.log('Postgres is not reachable yet. Trying docker compose up -d postgres...');
    const docker = spawnSync('docker', ['compose', 'up', '-d', 'postgres'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 60_000,
    });
    if (docker.status !== 0) {
      console.log(docker.stdout.trim());
      console.error(docker.stderr.trim() || 'Could not start Postgres with docker compose.');
      console.log('Start it manually with: docker compose up -d postgres');
      process.exit(1);
    }
    console.log(docker.stdout.trim() || 'docker compose started postgres.');
    health = await collectRagHealth();
  }

  const tablesOk = health.checks.find((check) => check.name === 'RAG tables')?.ok;
  const vectorOk = health.checks.find((check) => check.name === 'pgvector extension')?.ok;
  if (!tablesOk || !vectorOk) {
    console.log('Applying RAG migration...');
    const migrate = spawnSync('npm', ['run', 'rag:migrate'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 120_000,
      stdio: 'pipe',
    });
    if (migrate.status !== 0) {
      console.log(migrate.stdout.trim());
      console.error(migrate.stderr.trim() || 'RAG migration failed.');
      process.exit(1);
    }
    console.log(migrate.stdout.trim());
    health = await collectRagHealth();
  }

  console.log('');
  console.log(health.ready ? 'RAG is ready for testing.' : 'RAG setup completed, but it is not ready to trust yet.');
  for (const step of health.nextSteps) console.log(`- ${step}`);
  if (!health.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
