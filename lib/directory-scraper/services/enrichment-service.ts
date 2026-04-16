import type { Browser, Page } from 'playwright';
import { enrichCompany } from '../enrich-company';
import { retryableError } from '../errors';
import { launchChromiumForScraper } from '../playwright-launch';
import { runWithEnrichmentBudget } from '../enrichment-timeout';
import { getDirectoryScraperWorkerConfig } from '../worker-config';
import { sleep } from '../utils';
import type { CancelSignal } from '../extract-directory-entries';
import type { CompanyResult, DirectoryEntry } from '../types';

export interface EnrichmentPatch {
  resultId: string;
  patch: Partial<CompanyResult>;
}

export interface EnrichmentServiceResult {
  patches: EnrichmentPatch[];
  processedCount: number;
}

export async function runEnrichmentService(
  rows: CompanyResult[],
  options: {
    visitWebsites: boolean;
    cancelled: CancelSignal;
    onLog?: (level: 'info' | 'warn' | 'error', message: string, eventCode?: string) => void | Promise<void>;
    onProgress?: (current: number, total: number, currentCompanyName?: string) => void | Promise<void>;
  },
): Promise<EnrichmentServiceResult> {
  const log = async (level: 'info' | 'warn' | 'error', message: string, eventCode?: string) => {
    if (options.onLog) {
      await Promise.resolve(options.onLog(level, message, eventCode));
    }
  };

  if (!options.visitWebsites) {
    await log(
      'info',
      'Company website enrichment skipped because visitCompanyWebsites is disabled for this job.',
      'ENRICHMENT_SKIPPED',
    );
    return { patches: [], processedCount: 0 };
  }

  if (rows.length === 0) {
    await log('info', 'No pending rows remain for enrichment.', 'ENRICHMENT_NOOP');
    return { patches: [], processedCount: 0 };
  }

  const config = getDirectoryScraperWorkerConfig();
  let browser: Browser | null = null;
  try {
    const launch = await launchChromiumForScraper();
    browser = launch.browser;
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });
    const basePage = await context.newPage();

    const patches: EnrichmentPatch[] = [];
    for (let index = 0; index < rows.length; index += config.enrichmentConcurrency) {
      if (await Promise.resolve(options.cancelled())) {
        await log('warn', 'Cancellation requested during enrichment.', 'ENRICHMENT_CANCELLED');
        break;
      }

      const batch = rows.slice(index, index + config.enrichmentConcurrency);
      const batchPatches = await Promise.all(
        batch.map((row) =>
          enrichSingleRow(basePage, row, {
            cancelled: options.cancelled,
            onLog: log,
            rowBudgetMs: config.enrichmentRowBudgetMs,
            navigationTimeoutMs: config.enrichmentNavigationTimeoutMs,
          }),
        ),
      );
      patches.push(...batchPatches);
      if (options.onProgress) {
        const last = batch[batch.length - 1];
        await Promise.resolve(options.onProgress(patches.length, rows.length, last?.companyName));
      }

      if (index + config.enrichmentConcurrency < rows.length) {
        await sleep(config.delayBetweenCompaniesMs);
      }
    }

    await log('info', `Enrichment finished for ${patches.length} row(s).`, 'ENRICHMENT_COMPLETED');
    return { patches, processedCount: patches.length };
  } catch (error) {
    if (error instanceof Error) {
      throw retryableError('ENRICHMENT_PIPELINE_FAILED', 'enriching', error.message);
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function enrichSingleRow(
  page: Page,
  row: CompanyResult,
  options: {
    cancelled: CancelSignal;
    onLog: (level: 'info' | 'warn' | 'error', message: string, eventCode?: string) => Promise<void>;
    rowBudgetMs: number;
    navigationTimeoutMs: number;
  },
): Promise<EnrichmentPatch> {
  const entry: DirectoryEntry = {
    name: row.companyName,
    url: row.directoryListingUrl,
    detailUrl: row.nameExtractionMeta?.detailUrl?.trim() || undefined,
    existingCompanyWebsite: row.companyWebsite?.trim() || undefined,
    websiteDiscoveryMethod: row.websiteDiscoveryMeta?.method,
  };

  const rowLog = async (message: string) => {
    await options.onLog('info', `[${row.companyName.slice(0, 48)}] ${message}`, 'ENRICHMENT_ROW_EVENT');
  };

  try {
    const enrichPage = await page.context().newPage();
    enrichPage.setDefaultNavigationTimeout(options.navigationTimeoutMs);
    enrichPage.setDefaultTimeout(Math.min(options.navigationTimeoutMs, 25_000));
    try {
      const result = await runWithEnrichmentBudget(options.rowBudgetMs, () =>
        enrichCompany(enrichPage, entry, true, options.cancelled, row.id, rowLog),
      );
      return {
        resultId: row.id,
        patch: {
          ...result,
          id: row.id,
          nameExtractionMeta: row.nameExtractionMeta,
          websiteDiscoveryMeta: row.websiteDiscoveryMeta,
        },
      };
    } finally {
      await enrichPage.close().catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown enrichment failure';
    await options.onLog('warn', `[${row.companyName.slice(0, 48)}] ${message}`, 'ENRICHMENT_ROW_FAILED');
    return {
      resultId: row.id,
      patch: {
        status: 'failed',
        error: message,
        notes: `Enrichment failed: ${message}`,
        needsReview: true,
        nameExtractionMeta: row.nameExtractionMeta,
        websiteDiscoveryMeta: row.websiteDiscoveryMeta,
      },
    };
  }
}
