import { runPhoneCampaignWorker } from '../lib/phone/worker';

let shuttingDown = false;

function handleSignal(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`[phone-campaign-worker] received ${signal}, shutting down after current loop...`);
  process.exit(0);
}

process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

const runOnce = process.env.RUN_ONCE === '1' || process.env.RUN_ONCE === 'true';

runPhoneCampaignWorker(runOnce ? { once: true } : undefined)
  .then(() => {
    if (runOnce) {
      // eslint-disable-next-line no-console
      console.log('[phone-campaign-worker] RUN_ONCE complete; queue drained.');
      process.exit(0);
    }
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[phone-campaign-worker] fatal error', error);
    process.exit(1);
  });
