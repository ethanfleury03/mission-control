import { randomUUID } from 'crypto';
import * as store from './job-store';
import { classifyDirectoryScraperError, computeRetryBackoffMs } from './errors';
import { runScrapeJobSafely } from './scrape-directory';
import { sleep } from './utils';
import { getDirectoryScraperWorkerConfig } from './worker-config';
import type { JobPhase } from './types';

function makeFailureProgress(phase: JobPhase, message: string) {
  return {
    phase,
    current: 0,
    total: 0,
    percentage: 0,
    completedCompanies: 0,
    totalCompanies: 0,
    message,
  };
}

export async function runDirectoryScraperWorker(options?: {
  once?: boolean;
  owner?: string;
}) {
  const config = getDirectoryScraperWorkerConfig();
  const owner = options?.owner ?? `directory-worker-${randomUUID().slice(0, 8)}`;
  let startupFailureCount = 0;

  for (;;) {
    let job: Awaited<ReturnType<typeof store.claimNextJob>> | undefined;
    try {
      job = await store.claimNextJob(owner, config.leaseMs);
      startupFailureCount = 0;
    } catch (error) {
      startupFailureCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error(
        `[directory-scraper-worker] transient store error while polling for jobs (attempt ${startupFailureCount}): ${message}`,
      );
      if (options?.once) {
        throw error;
      }
      await sleep(config.startupRetryDelayMs);
      continue;
    }

    if (!job) {
      if (options?.once) return;
      await sleep(config.pollIntervalMs);
      continue;
    }

    const heartbeat = setInterval(() => {
      void store.renewJobLease(job.id, owner, config.leaseMs);
    }, config.heartbeatMs);

    try {
      await store.updateJobStatus(job.id, 'running', {
        phase: job.phase,
        heartbeatAt: new Date(),
        leaseOwner: owner,
        leaseExpiresAt: new Date(Date.now() + config.leaseMs),
        nextRetryAt: null,
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
      });

      await runScrapeJobSafely(job.id);
    } catch (error) {
      const latest = await store.getJob(job.id);
      const phase = (latest?.phase ?? job.phase ?? 'queued') as JobPhase;
      const classified = classifyDirectoryScraperError(error, phase);
      const attemptCount = latest?.attemptCount ?? job.attemptCount;
      const maxAttempts = latest?.maxAttempts ?? job.maxAttempts;

      if (classified.retryable && attemptCount < maxAttempts) {
        const nextRetryAt = new Date(Date.now() + computeRetryBackoffMs(attemptCount));
        await store.updateJobStatus(job.id, 'queued', {
          phase,
          finishedAt: null,
          heartbeatAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextRetryAt,
          errorCode: classified.code,
          errorMessage: classified.message,
          progress: makeFailureProgress(
            phase,
            `Retry ${attemptCount + 1} of ${maxAttempts} scheduled for ${nextRetryAt.toISOString()}.`,
          ),
        });
        await store.addLog(
          job.id,
          'warn',
          `Attempt ${attemptCount} failed with ${classified.code}; retry scheduled for ${nextRetryAt.toISOString()}.`,
          { phase, eventCode: 'JOB_RETRY_SCHEDULED' },
        );
      } else {
        await store.updateJobStatus(job.id, 'failed', {
          phase: 'failed',
          finishedAt: new Date(),
          heartbeatAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          errorCode: classified.code,
          errorMessage: classified.message,
          progress: makeFailureProgress('failed', classified.message),
        });
        await store.addLog(
          job.id,
          'error',
          `Job failed after ${attemptCount} attempt(s): ${classified.message}`,
          { phase: 'failed', eventCode: 'JOB_FAILED' },
        );
      }
    } finally {
      clearInterval(heartbeat);
      await store.releaseJobLease(job.id, owner);
    }

    if (options?.once) return;
  }
}
