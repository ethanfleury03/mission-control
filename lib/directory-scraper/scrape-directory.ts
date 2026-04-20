import * as store from './job-store';
import { classifyDirectoryScraperError } from './errors';
import { runEnrichmentService } from './services/enrichment-service';
import { runNameExtractionService } from './services/name-extraction-service';
import { persistInitialCandidates, persistResultPatches } from './services/result-persistence-service';
import { runWebsiteDiscoveryService } from './services/website-discovery-service';
import type { JobPhase, JobProgress, ScrapeJob } from './types';

function makeProgress(
  phase: JobPhase,
  current: number,
  total: number,
  options?: {
    totalCompanies?: number;
    completedCompanies?: number;
    currentCompanyName?: string;
    message?: string;
  },
): JobProgress {
  return {
    phase,
    current,
    total,
    percentage: total > 0 ? Math.round((current / total) * 100) : phase === 'queued' ? 0 : 100,
    completedCompanies: options?.completedCompanies ?? 0,
    totalCompanies: options?.totalCompanies ?? 0,
    currentCompanyName: options?.currentCompanyName,
    message: options?.message,
  };
}

async function logJob(
  jobId: string,
  phase: JobPhase,
  level: 'info' | 'warn' | 'error',
  eventCode: string,
  message: string,
) {
  await store.addLog(jobId, level, message, { phase, eventCode });
}

async function updatePhaseProgress(
  jobId: string,
  phase: JobPhase,
  current: number,
  total: number,
  options?: {
    totalCompanies?: number;
    completedCompanies?: number;
    currentCompanyName?: string;
    message?: string;
  },
) {
  await store.updateJobStatus(jobId, 'running', {
    phase,
    progress: makeProgress(phase, current, total, options),
    heartbeatAt: new Date(),
  });
}

function determineNextPhase(job: ScrapeJob): JobPhase {
  if (job.cancelRequestedAt) return 'cancelled';
  if (job.status === 'completed' || job.phase === 'completed') return 'completed';
  if (job.status === 'cancelled' || job.phase === 'cancelled') return 'cancelled';
  if (job.results.length === 0) return 'extracting_names';

  const hasPending = job.results.some((row) => row.status === 'pending');
  const websiteDiscoveryQueuedFromRetry =
    job.status === 'queued' && job.phase === 'discovering_websites';
  if (
    job.input.enableSerperWebsiteDiscovery &&
    (job.phase === 'queued' || job.phase === 'extracting_names' || websiteDiscoveryQueuedFromRetry)
  ) {
    return 'discovering_websites';
  }

  if (
    job.input.visitCompanyWebsites &&
    hasPending &&
    (job.phase === 'queued' ||
      job.phase === 'extracting_names' ||
      job.phase === 'discovering_websites' ||
      job.phase === 'enriching')
  ) {
    return 'enriching';
  }

  return 'exporting_optional';
}

async function finalizeCancelled(jobId: string, message: string) {
  const job = await store.getJob(jobId);
  const progress = makeProgress('cancelled', 0, 0, {
    totalCompanies: job?.summary.companiesFound ?? 0,
    completedCompanies: job?.summary.companiesProcessed ?? 0,
    message,
  });
  await logJob(jobId, 'cancelled', 'warn', 'JOB_CANCELLED', message);
  await store.updateJobStatus(jobId, 'cancelled', {
    phase: 'cancelled',
    finishedAt: new Date(),
    leaseOwner: null,
    leaseExpiresAt: null,
    progress,
  });
}

export async function runScrapeJob(jobId: string): Promise<void> {
  const startingJob = await store.getJob(jobId);
  if (!startingJob) return;

  await logJob(
    jobId,
    startingJob.phase,
    'info',
    'JOB_ATTEMPT_STARTED',
    `Worker started scrape attempt ${startingJob.attemptCount} for ${startingJob.input.url}.`,
  );

  let phase = determineNextPhase(startingJob);
  while (phase !== 'completed') {
    if (phase === 'cancelled') {
      await finalizeCancelled(jobId, 'Cancellation requested; stopping at the next safe checkpoint.');
      return;
    }

    if (phase === 'extracting_names') {
      await updatePhaseProgress(jobId, phase, 0, 1, {
        message: 'Extracting company names from the directory page.',
      });
      await logJob(jobId, phase, 'info', 'PHASE_STARTED', 'Starting company name extraction.');

      const extraction = await runNameExtractionService(startingJob.input, {
        cancelled: () => store.isJobCancelled(jobId),
        onLog: (message) => logJob(jobId, phase, 'info', 'EXTRACTION_EVENT', message),
      });

      await store.patchJobMeta(jobId, {
        nameExtractionDebug: extraction.debug,
        lastError: undefined,
      });

      if (extraction.debug.zeroResultExplanation) {
        await logJob(jobId, phase, 'warn', 'EXTRACTION_ZERO_RESULTS', extraction.debug.zeroResultExplanation);
      }

      const results = await persistInitialCandidates(jobId, extraction.candidates, {
        visitWebsites: startingJob.input.visitCompanyWebsites ?? false,
      });
      const willDiscoverWebsites = startingJob.input.enableSerperWebsiteDiscovery ?? false;

      await updatePhaseProgress(jobId, phase, 1, 1, {
        totalCompanies: results.length,
        completedCompanies: results.filter((row) => row.status === 'done' || row.status === 'failed').length,
        message: willDiscoverWebsites
          ? `Extracted ${results.length} company name(s). Saved rows and queued homepage discovery.`
          : `Extracted ${results.length} company name(s).`,
      });
      await logJob(jobId, phase, 'info', 'PHASE_COMPLETED', `Name extraction completed with ${results.length} row(s).`);
      if (results.length > 0) {
        await logJob(
          jobId,
          phase,
          'info',
          'ROWS_PERSISTED',
          willDiscoverWebsites
            ? `Saved ${results.length} extracted row(s). Homepage discovery is next and will update company URLs in place.`
            : `Saved ${results.length} extracted row(s).`,
        );
      }
    }

    const jobAfterExtraction = await store.getJob(jobId);
    if (!jobAfterExtraction) return;
    if (jobAfterExtraction.cancelRequestedAt) {
      await finalizeCancelled(jobId, 'Cancellation requested after extraction.');
      return;
    }

    phase = determineNextPhase(jobAfterExtraction);
    if (phase === 'discovering_websites') {
      const results = jobAfterExtraction.results;
      const total = results.filter((row) => !row.companyWebsite?.trim()).length || results.length;
      await updatePhaseProgress(jobId, phase, 0, total, {
        totalCompanies: jobAfterExtraction.summary.companiesFound,
        completedCompanies: jobAfterExtraction.summary.companiesProcessed,
        message: 'Resolving company homepages for extracted rows.',
      });
      await logJob(
        jobId,
        phase,
        'info',
        'PHASE_STARTED',
        `Starting website discovery for ${total} extracted row(s).`,
      );

      const discovery = await runWebsiteDiscoveryService(results, {
        enabled: jobAfterExtraction.input.enableSerperWebsiteDiscovery ?? false,
        cancelled: () => store.isJobCancelled(jobId),
        onLog: (level, message, eventCode) => logJob(jobId, phase, level, eventCode ?? 'DISCOVERY_EVENT', message),
        onProgress: (current, totalRows, currentCompanyName) =>
          updatePhaseProgress(jobId, phase, current, totalRows, {
            totalCompanies: jobAfterExtraction.summary.companiesFound,
            completedCompanies: jobAfterExtraction.summary.companiesProcessed,
            currentCompanyName,
            message: 'Resolving company homepages.',
          }),
      });

      await persistResultPatches(jobId, discovery.patches);
      await store.patchJobMeta(jobId, { websiteDiscoverySummary: discovery.summary, lastError: undefined });
      await updatePhaseProgress(jobId, phase, total, total, {
        totalCompanies: jobAfterExtraction.summary.companiesFound,
        completedCompanies: jobAfterExtraction.summary.companiesProcessed,
        message: 'Website discovery finished.',
      });
      await logJob(jobId, phase, 'info', 'PHASE_COMPLETED', 'Website discovery completed.');
    }

    const jobAfterDiscovery = await store.getJob(jobId);
    if (!jobAfterDiscovery) return;
    if (jobAfterDiscovery.cancelRequestedAt) {
      await finalizeCancelled(jobId, 'Cancellation requested after website discovery.');
      return;
    }

    phase = determineNextPhase(jobAfterDiscovery);
    if (phase === 'enriching') {
      const rows = jobAfterDiscovery.results.filter((row) => row.status === 'pending');
      await updatePhaseProgress(jobId, phase, 0, rows.length, {
        totalCompanies: jobAfterDiscovery.summary.companiesFound,
        completedCompanies: jobAfterDiscovery.summary.companiesProcessed,
        message: 'Visiting company websites and extracting contact data.',
      });
      await logJob(jobId, phase, 'info', 'PHASE_STARTED', `Starting enrichment for ${rows.length} row(s).`);

      const enrichment = await runEnrichmentService(rows, {
        visitWebsites: jobAfterDiscovery.input.visitCompanyWebsites ?? false,
        cancelled: () => store.isJobCancelled(jobId),
        onLog: (level, message, eventCode) => logJob(jobId, phase, level, eventCode ?? 'ENRICHMENT_EVENT', message),
        onProgress: (current, totalRows, currentCompanyName) =>
          updatePhaseProgress(jobId, phase, current, totalRows, {
            totalCompanies: jobAfterDiscovery.summary.companiesFound,
            completedCompanies: current,
            currentCompanyName,
            message: 'Extracting contact data from company sites.',
          }),
      });

      await persistResultPatches(jobId, enrichment.patches);
      const lastPatch = enrichment.patches[enrichment.patches.length - 1];
      if (lastPatch) {
        const lastRow = jobAfterDiscovery.results.find((row) => row.id === lastPatch.resultId);
        if (lastRow) {
          await store.patchJobMeta(jobId, {
            lastProcessedCompanyName: lastRow.companyName,
            lastError: undefined,
          });
        }
      }
      await updatePhaseProgress(jobId, phase, rows.length, rows.length, {
        totalCompanies: jobAfterDiscovery.summary.companiesFound,
        completedCompanies: rows.length,
        message: 'Enrichment finished.',
      });
      await logJob(jobId, phase, 'info', 'PHASE_COMPLETED', 'Enrichment completed.');
    }

    const jobAfterEnrichment = await store.getJob(jobId);
    if (!jobAfterEnrichment) return;
    if (jobAfterEnrichment.cancelRequestedAt) {
      await finalizeCancelled(jobId, 'Cancellation requested after enrichment.');
      return;
    }

    phase = determineNextPhase(jobAfterEnrichment);
    if (phase === 'exporting_optional') {
      await updatePhaseProgress(jobId, phase, 1, 1, {
        totalCompanies: jobAfterEnrichment.summary.companiesFound,
        completedCompanies: jobAfterEnrichment.summary.companiesProcessed,
        message: 'Scrape is complete. Results are ready for export or import.',
      });
      await logJob(jobId, phase, 'info', 'EXPORT_READY', 'Results are ready for optional export/import.');
      await store.updateJobStatus(jobId, 'completed', {
        phase: 'completed',
        finishedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
        progress: makeProgress('completed', 1, 1, {
          totalCompanies: jobAfterEnrichment.summary.companiesFound,
          completedCompanies: jobAfterEnrichment.summary.companiesProcessed,
          message: 'Job completed.',
        }),
      });
      await store.patchJobMeta(jobId, { lastError: undefined });
      await logJob(jobId, 'completed', 'info', 'JOB_COMPLETED', 'Scrape job completed successfully.');
      return;
    }

    if (phase === 'completed') {
      return;
    }
  }
}

export async function runScrapeJobSafely(jobId: string): Promise<void> {
  try {
    await runScrapeJob(jobId);
  } catch (error) {
    const job = await store.getJob(jobId);
    const phase = job?.phase ?? 'queued';
    const classified = classifyDirectoryScraperError(error, phase);
    await store.patchJobMeta(jobId, { lastError: classified.message });
    await logJob(jobId, classified.phase, 'error', classified.code, classified.message);
    throw classified;
  }
}
