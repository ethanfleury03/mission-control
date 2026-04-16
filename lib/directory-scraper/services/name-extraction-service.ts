import type { Browser } from 'playwright';
import { extractCompanyNamesFromFirecrawl, extractCompanyNamesFromPage } from '../extract-company-names';
import { firecrawlScrape, isFirecrawlConfigured } from '../firecrawl-client';
import { validationError, retryableError } from '../errors';
import { launchChromiumForScraper } from '../playwright-launch';
import type { CancelSignal } from '../extract-directory-entries';
import type {
  ExtractedCompanyCandidate,
  NameExtractionDebugSummary,
  ScrapeFetchMode,
  ScrapeJobInput,
} from '../types';
import { validateScrapeUrl } from '../validate-scrape-url';

export interface NameExtractionServiceResult {
  candidates: ExtractedCompanyCandidate[];
  debug: NameExtractionDebugSummary;
  fetchMode: ScrapeFetchMode;
}

export async function runNameExtractionService(
  input: ScrapeJobInput,
  options: {
    cancelled: CancelSignal;
    onLog?: (message: string) => void | Promise<void>;
  },
): Promise<NameExtractionServiceResult> {
  const sourceUrl = input.url?.trim() ?? '';
  if (!sourceUrl) {
    throw validationError('SCRAPER_URL_REQUIRED', 'extracting_names', 'Directory URL is required.');
  }

  const urlCheck = validateScrapeUrl(sourceUrl);
  if (!urlCheck.ok) {
    throw validationError('URL_BLOCKED', 'extracting_names', urlCheck.error ?? 'Directory URL is not allowed.');
  }

  const fetchMode = input.scrapeFetchMode ?? 'playwright';
  if (fetchMode === 'firecrawl') {
    if (!isFirecrawlConfigured()) {
      throw validationError(
        'FIRECRAWL_NOT_CONFIGURED',
        'extracting_names',
        'Firecrawl mode requires FIRECRAWL_API_KEY in the server environment.',
      );
    }

    const response = await firecrawlScrape(urlCheck.normalizedUrl ?? sourceUrl);
    if (!response.ok) {
      throw retryableError('FIRECRAWL_REQUEST_FAILED', 'extracting_names', response.error);
    }

    const result = await extractCompanyNamesFromFirecrawl(response, urlCheck.normalizedUrl ?? sourceUrl, {
      sourceUrl: urlCheck.normalizedUrl ?? sourceUrl,
      maxCompanies: input.maxCompanies,
      enableAiFallback: input.enableAiNameFallback ?? false,
      cancelled: options.cancelled,
      onLog: options.onLog,
    });

    return {
      candidates: result.candidates,
      debug: { ...result.debug, fetchEngine: 'firecrawl' },
      fetchMode: 'firecrawl',
    };
  }

  let browser: Browser | null = null;
  try {
    const launch = await launchChromiumForScraper();
    browser = launch.browser;
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    const result = await extractCompanyNamesFromPage(page, {
      sourceUrl: urlCheck.normalizedUrl ?? sourceUrl,
      maxCompanies: input.maxCompanies,
      enableAiFallback: input.enableAiNameFallback ?? false,
      cancelled: options.cancelled,
      onLog: options.onLog,
    });

    return {
      candidates: result.candidates,
      debug: { ...result.debug, fetchEngine: 'playwright' },
      fetchMode: 'playwright',
    };
  } catch (error) {
    if (error instanceof Error) {
      throw retryableError('PLAYWRIGHT_EXTRACTION_FAILED', 'extracting_names', error.message);
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
