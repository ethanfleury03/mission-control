import { runDirectoryScraperWorker } from '../lib/directory-scraper/worker';

let shuttingDown = false;

function handleSignal(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`[directory-scraper-worker] received ${signal}, shutting down after current loop...`);
  process.exit(0);
}

process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

runDirectoryScraperWorker().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[directory-scraper-worker] fatal error', error);
  process.exit(1);
});
