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

// RUN_ONCE=1 drains the queue and exits. Used by the Cloud Run Job "mc-scraper"
// which is invoked on a Cloud Scheduler cadence. Without it the worker loops forever,
// which is the right behavior for local dev and dedicated-service deployments.
const runOnce = process.env.RUN_ONCE === '1' || process.env.RUN_ONCE === 'true';

runDirectoryScraperWorker(runOnce ? { once: true } : undefined)
  .then(() => {
    if (runOnce) {
      // eslint-disable-next-line no-console
      console.log('[directory-scraper-worker] RUN_ONCE complete; queue drained.');
      process.exit(0);
    }
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[directory-scraper-worker] fatal error', error);
    process.exit(1);
  });
