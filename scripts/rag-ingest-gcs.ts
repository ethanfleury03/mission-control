import { spawnSync } from 'node:child_process';

import { loadLocalEnv } from './rag-env';

function main() {
  loadLocalEnv();
  const target = process.argv[2];
  if (!target?.startsWith('gs://')) {
    throw new Error('Usage: npm run rag:ingest:gcs -- gs://bucket/path');
  }

  console.log('Direct GCS ingestion is intentionally a local sync workflow for now.');
  const gcloud = spawnSync('gcloud', ['--version'], { encoding: 'utf8', timeout: 10_000 });
  if (gcloud.status !== 0) {
    console.log('Install and authenticate the Google Cloud CLI first: https://cloud.google.com/sdk/docs/install');
  }

  console.log('');
  console.log('Recommended path:');
  console.log('1. gcloud auth login');
  console.log('2. mkdir -p .local-storage/arrow-manuals');
  console.log(`3. gsutil -m rsync -r "${target}" .local-storage/arrow-manuals`);
  console.log('4. npm run rag:ingest -- .local-storage/arrow-manuals --recursive');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
