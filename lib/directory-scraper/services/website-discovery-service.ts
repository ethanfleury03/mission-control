import type { Browser, BrowserContext, Page } from 'playwright';
import { findDominantPlaceholderDomain } from '../discover-company-website';
import type { CancelSignal } from '../extract-directory-entries';
import { extractCompanyWebsiteFromDetail } from '../extract-company-website-from-detail';
import { launchChromiumForScraper } from '../playwright-launch';
import type {
  CompanyResult,
  JobPhase,
  WebsiteDiscoveryJobSummary,
  WebsiteDiscoveryMeta,
} from '../types';
import { normalizeDomain, sleep } from '../utils';
import { getDirectoryScraperWorkerConfig } from '../worker-config';

export interface WebsiteDiscoveryPatch {
  resultId: string;
  patch: Partial<CompanyResult>;
}

export interface WebsiteDiscoveryServiceResult {
  patches: WebsiteDiscoveryPatch[];
  summary: WebsiteDiscoveryJobSummary;
}

function emptySummary(skippedAlreadyHadUrl: number): WebsiteDiscoveryJobSummary {
  return {
    attempted: 0,
    resolvedDetailPage: 0,
    resolvedDomainGuess: 0,
    resolvedSerper: 0,
    unresolved: 0,
    skippedAlreadyHadUrl,
  };
}

function shouldAbortDiscoveryResource(resourceType: string): boolean {
  return resourceType === 'image' || resourceType === 'media' || resourceType === 'font' || resourceType === 'stylesheet';
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
      summary: emptySummary(results.length),
    };
  }

  const dominant = findDominantPlaceholderDomain(results);
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
    ...emptySummary(results.length - rows.length),
    attempted: rows.length,
  };

  if (rows.length === 0) {
    await log('info', 'Website discovery found no rows that still need a company homepage.', 'DISCOVERY_NOOP');
    return { patches: [], summary };
  }

  const config = getDirectoryScraperWorkerConfig();
  const patches: WebsiteDiscoveryPatch[] = [];
  let browser: Browser | null = null;
  let contexts: BrowserContext[] = [];
  let pages: Page[] = [];
  let completedCount = 0;

  try {
    const launch = await launchChromiumForScraper();
    browser = launch.browser;
    const concurrency = Math.max(1, Math.min(config.websiteDiscoveryConcurrency, 12));
    contexts = await Promise.all(
      Array.from({ length: concurrency }, () =>
        browser!.newContext({
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 720 },
        }),
      ),
    );
    await Promise.all(
      contexts.map((context) =>
        context.route('**/*', (route) => {
          if (shouldAbortDiscoveryResource(route.request().resourceType())) {
            return route.abort();
          }
          return route.continue();
        }),
      ),
    );
    pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(
      pages.map((page) => {
        page.setDefaultNavigationTimeout(config.websiteDiscoveryNavigationTimeoutMs);
        page.setDefaultTimeout(Math.min(config.websiteDiscoveryNavigationTimeoutMs, 15_000));
        return Promise.resolve();
      }),
    );

    for (let index = 0; index < rows.length; index += pages.length) {
      if (await Promise.resolve(options.cancelled())) {
        await log('warn', 'Cancellation requested during website discovery.', 'DISCOVERY_CANCELLED');
        break;
      }

      const batch = rows.slice(index, index + pages.length);
      const outcomes = await Promise.all(
        batch.map(async (row, batchIndex) => {
          const page = pages[batchIndex]!;
          const detailUrl = row.directoryListingUrl?.trim();
          if (!detailUrl) {
            return {
              row,
              website: '',
              meta: {
                method: 'none',
                detail: 'No member detail URL was available for this row.',
              } satisfies WebsiteDiscoveryMeta,
            };
          }

          const extraction = await extractCompanyWebsiteFromDetail(page, detailUrl);
          const website = extraction.website.trim();
          if (website) {
            return {
              row,
              website,
              meta: {
                method: 'detail-page',
                detail: `Extracted external homepage from member detail page ${extraction.debug.finalUrl || detailUrl}`,
              } satisfies WebsiteDiscoveryMeta,
              debug: extraction.debug,
            };
          }

          return {
            row,
            website: '',
            meta: {
              method: 'none',
              detail: `No external homepage link found on member detail page ${extraction.debug.finalUrl || detailUrl}`,
            } satisfies WebsiteDiscoveryMeta,
            debug: extraction.debug,
          };
        }),
      );

      for (const { row, website, meta, debug } of outcomes) {
        const patch: Partial<CompanyResult> = { websiteDiscoveryMeta: meta };
        if (website) {
          summary.resolvedDetailPage += 1;
          patch.companyWebsite = website;
          const noteLine = `Website (${meta.method}): ${meta.detail}`;
          patch.notes = row.notes?.trim() ? `${row.notes.trim()} | ${noteLine}` : noteLine;
          await log('info', `Detail page website: ${row.companyName} -> ${website}`, 'DISCOVERY_DETAIL_PAGE_URL');
        } else {
          summary.unresolved += 1;
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
            const noteLine = `Website cleared: shared listing domain (${dominant}); ${meta.detail}`;
            patch.notes = row.notes?.trim() ? `${row.notes.trim()} | ${noteLine}` : noteLine;
          } else {
            const noteLine = `Website lookup: ${meta.detail}`;
            patch.notes = row.notes?.trim() ? `${row.notes.trim()} | ${noteLine}` : noteLine;
          }
          const top = (debug?.topCandidates ?? []).slice(0, 2).map((c) => `${c.href} (score ${c.score})`).join(' | ');
          await log(
            'warn',
            `No detail-page website found for ${row.companyName}; finalUrl=${debug?.finalUrl || row.directoryListingUrl}; visibleTextHasUrl=${debug?.visibleTextHasUrl ? 'yes' : 'no'}${top ? `; top=${top}` : ''}`,
            'DISCOVERY_DETAIL_PAGE_MISS',
          );
        }

        patches.push({ resultId: row.id, patch });
        completedCount += 1;
      }

      if (options.onProgress) {
        const last = batch[batch.length - 1];
        await Promise.resolve(options.onProgress(completedCount, rows.length, last?.companyName));
      }

      if (index + pages.length < rows.length) {
        await sleep(config.delayBetweenWebsiteDiscoveryBatchesMs);
      }
    }
  } finally {
    await Promise.all(pages.map((page) => page.close().catch(() => {})));
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  await log(
    'info',
    `Website discovery finished: detail page ${summary.resolvedDetailPage}, unresolved ${summary.unresolved}.`,
    'DISCOVERY_COMPLETED',
  );

  return { patches, summary };
}
