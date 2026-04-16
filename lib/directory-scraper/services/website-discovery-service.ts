import { discoverCompanyWebsite, findDominantPlaceholderDomain } from '../discover-company-website';
import { validationError } from '../errors';
import { isSerperConfigured } from '../serper-client';
import { normalizeDomain, sleep } from '../utils';
import { getDirectoryScraperWorkerConfig } from '../worker-config';
import type {
  CompanyResult,
  JobPhase,
  WebsiteDiscoveryJobSummary,
  WebsiteDiscoveryMeta,
} from '../types';
import type { CancelSignal } from '../extract-directory-entries';

export interface WebsiteDiscoveryPatch {
  resultId: string;
  patch: Partial<CompanyResult>;
}

export interface WebsiteDiscoveryServiceResult {
  patches: WebsiteDiscoveryPatch[];
  summary: WebsiteDiscoveryJobSummary;
}

export async function runWebsiteDiscoveryService(
  results: CompanyResult[],
  options: {
    enabled: boolean;
    cancelled: CancelSignal;
    onLog?: (level: 'info' | 'warn' | 'error', message: string, eventCode?: string) => void | Promise<void>;
    onProgress?: (current: number, total: number, currentCompanyName?: string) => void | Promise<void>;
  },
): Promise<WebsiteDiscoveryServiceResult> {
  const phase: JobPhase = 'discovering_websites';
  const log = async (level: 'info' | 'warn' | 'error', message: string, eventCode?: string) => {
    if (options.onLog) {
      await Promise.resolve(options.onLog(level, message, eventCode));
    }
  };

  if (!options.enabled) {
    await log('info', 'Website discovery skipped for this job.', 'DISCOVERY_SKIPPED');
    return {
      patches: [],
      summary: {
        attempted: 0,
        resolvedDomainGuess: 0,
        resolvedSerper: 0,
        unresolved: 0,
        skippedAlreadyHadUrl: results.length,
      },
    };
  }

  if (!isSerperConfigured()) {
    throw validationError(
      'SERPER_NOT_CONFIGURED',
      phase,
      'Serper website discovery requires SERPER_API_KEY in the server environment.',
    );
  }

  const config = getDirectoryScraperWorkerConfig();
  const dominant = findDominantPlaceholderDomain(results);
  const rejectHosts = dominant ? [dominant] : undefined;
  const rows = results.filter((row) => {
    const website = row.companyWebsite?.trim();
    if (!website) return true;
    if (!dominant) return false;
    try {
      return normalizeDomain(website) === dominant;
    } catch {
      return false;
    }
  });

  const summary: WebsiteDiscoveryJobSummary = {
    attempted: rows.length,
    resolvedDomainGuess: 0,
    resolvedSerper: 0,
    unresolved: 0,
    skippedAlreadyHadUrl: results.length - rows.length,
  };

  if (rows.length === 0) {
    await log('info', 'Website discovery found no rows that still need a company homepage.', 'DISCOVERY_NOOP');
    return { patches: [], summary };
  }

  const patches: WebsiteDiscoveryPatch[] = [];
  for (let index = 0; index < rows.length; index += config.serperBatchSize) {
    if (await Promise.resolve(options.cancelled())) {
      await log('warn', 'Cancellation requested during website discovery.', 'DISCOVERY_CANCELLED');
      break;
    }

    const batch = rows.slice(index, index + config.serperBatchSize);
    const outcomes = await Promise.all(
      batch.map(async (row) => {
        const found = await discoverCompanyWebsite(row.companyName, {
          directoryListingUrl: row.directoryListingUrl,
          rejectHosts,
        });
        return { row, found };
      }),
    );

    for (const { row, found } of outcomes) {
      const meta: WebsiteDiscoveryMeta = {
        method: found.method,
        detail: found.detail,
        serperQuery: found.serperQuery,
      };

      if (found.method === 'domain-guess') summary.resolvedDomainGuess += 1;
      else if (found.method === 'serper') summary.resolvedSerper += 1;
      else summary.unresolved += 1;

      const website = found.website.trim();
      const patch: Partial<CompanyResult> = { websiteDiscoveryMeta: meta };

      if (website) {
        patch.companyWebsite = website;
        const noteLine = `Website (${found.method}): ${found.detail}`;
        patch.notes = row.notes?.trim() ? `${row.notes.trim()} | ${noteLine}` : noteLine;
      } else {
        const hadPlaceholder =
          dominant &&
          row.companyWebsite?.trim() &&
          (() => {
            try {
              return normalizeDomain(row.companyWebsite) === dominant;
            } catch {
              return false;
            }
          })();

        if (hadPlaceholder) {
          patch.companyWebsite = '';
          const noteLine = `Website cleared: shared listing domain (${dominant}); ${found.detail}`;
          patch.notes = row.notes?.trim() ? `${row.notes.trim()} | ${noteLine}` : noteLine;
        } else if (found.detail) {
          const noteLine = `Website lookup: ${found.detail}`;
          patch.notes = row.notes?.trim() ? `${row.notes.trim()} | ${noteLine}` : noteLine;
        }
      }

      patches.push({ resultId: row.id, patch });
      if (options.onProgress) {
        await Promise.resolve(options.onProgress(patches.length, rows.length, row.companyName));
      }
    }

    if (index + config.serperBatchSize < rows.length) {
      await sleep(config.delayBetweenSerperMs);
    }
  }

  await log(
    'info',
    `Website discovery finished: domain guess ${summary.resolvedDomainGuess}, Serper ${summary.resolvedSerper}, unresolved ${summary.unresolved}.`,
    'DISCOVERY_COMPLETED',
  );

  return { patches, summary };
}
