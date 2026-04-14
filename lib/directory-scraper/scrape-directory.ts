import type { Browser } from 'playwright';
import type {
  CompanyResult,
  DirectoryEntry,
  WebsiteDiscoveryJobSummary,
  WebsiteDiscoveryMeta,
} from './types';
import * as store from './job-store';
import { enrichCompany } from './enrich-company';
import { sleep } from './utils';
import { launchChromiumForScraper } from './playwright-launch';
import { validateScrapeUrl } from './validate-scrape-url';
import { v4 as uuid } from 'uuid';
import { extractCompanyNamesFromPage, extractCompanyNamesFromFirecrawl } from './extract-company-names';
import { candidateToCompanyResult } from './name-result-mapper';
import type { CancelSignal } from './extract-directory-entries';
import { firecrawlScrape, isFirecrawlConfigured } from './firecrawl-client';
import { discoverCompanyWebsite, findDominantPlaceholderDomain } from './discover-company-website';
import { isSerperConfigured } from './serper-client';
import { normalizeDomain } from './utils';
import { runWithEnrichmentBudget } from './enrichment-timeout';

const CONCURRENCY = 2;
const DELAY_BETWEEN_COMPANIES_MS = 1200;
const SERPER_BATCH = 2;
const DELAY_BETWEEN_SERPER_MS = 700;
/** Wall-clock cap per company so a hung TCP/DNS or stuck script cannot block the batch for minutes. */
const ENRICHMENT_ROW_BUDGET_MS = 90_000;
const ENRICHMENT_NAVIGATION_TIMEOUT_MS = 22_000;

function mockResults(): CompanyResult[] {
  const companies = [
    { name: 'Acme Corp', website: 'https://acme.example.com', email: 'sales@acme.example.com', phone: '+1-555-0100' },
    { name: 'Globex Inc', website: 'https://globex.example.com', email: 'info@globex.example.com', phone: '+1-555-0200' },
    { name: 'Initech', website: 'https://initech.example.com', email: '', phone: '+1-555-0300' },
    { name: 'Umbrella Corp', website: 'https://umbrella.example.com', email: 'contact@umbrella.example.com', phone: '' },
    { name: 'Soylent Corp', website: '', email: '', phone: '' },
    { name: 'Wayne Enterprises', website: 'https://wayne.example.com', email: 'bruce@wayne.example.com', phone: '+1-555-0600' },
    { name: 'Stark Industries', website: 'https://stark.example.com', email: 'tony@stark.example.com', phone: '+1-555-0700' },
    { name: 'Oscorp', website: 'https://oscorp.example.com', email: '', phone: '' },
  ];

  return companies.map((c, i) => ({
    id: uuid(),
    companyName: c.name,
    directoryListingUrl: `https://directory.example.com/company/${c.name.toLowerCase().replace(/\s+/g, '-')}`,
    companyWebsite: c.website,
    contactName: '',
    email: c.email,
    phone: c.phone,
    address: c.email ? '123 Business Ave, Anytown, CA 90210' : '',
    contactPageUrl: c.website ? `${c.website}/contact` : '',
    socialLinks: c.website ? `https://linkedin.com/company/${c.name.toLowerCase().replace(/\s+/g, '-')}` : '',
    notes: c.email ? 'Email found on company domain' : c.phone ? 'Phone found' : 'Minimal contact info',
    confidence: c.email && c.phone ? 'high' : c.email || c.phone ? 'medium' : 'low',
    status: 'done',
    needsReview: !(c.email && c.phone),
    sortOrder: i,
    nameExtractionMeta: {
      normalizedName: c.name.toLowerCase(),
      extractionMethod: 'jsonld',
      confidenceScore: 90,
      confidenceLabel: 'high',
      reasons: ['mock data'],
      sourceText: c.name,
    },
  }));
}

export async function runScrapeJob(jobId: string): Promise<void> {
  const job = await store.getJob(jobId);
  if (!job) return;

  await store.updateJobStatus(jobId, 'running');
  await store.addLog(jobId, 'info', `Starting scrape job for: ${job.input.url || 'MOCK MODE'}`);

  if (job.input.mockMode || !job.input.url) {
    await store.addLog(jobId, 'info', 'Running in mock mode');
    const results = mockResults();
    await store.setResults(jobId, results);
    await store.recalcSummary(jobId);
    await store.addLog(jobId, 'info', `Mock data loaded: ${results.length} companies`);
    await store.updateJobStatus(jobId, 'completed');
    await store.patchJobMeta(jobId, { lastError: undefined });
    return;
  }

  const seedCheck = validateScrapeUrl(job.input.url);
  if (!seedCheck.ok) {
    await store.addLog(jobId, 'error', `Blocked URL: ${seedCheck.error}`);
    await store.patchJobMeta(jobId, {
      lastError: seedCheck.error,
      nameExtractionDebug: {
        sourceUrl: job.input.url,
        finalUrl: job.input.url,
        zeroResultExplanation: `URL blocked: ${seedCheck.error}`,
        topContainers: [],
        strategyCounts: {},
        aiFallbackUsed: false,
      },
    });
    await store.updateJobStatus(jobId, 'failed');
    return;
  }

  const fetchMode = job.input.scrapeFetchMode ?? 'playwright';
  const useFirecrawl = fetchMode === 'firecrawl';

  if (useFirecrawl && !isFirecrawlConfigured()) {
    await store.addLog(jobId, 'error', 'Firecrawl mode selected but FIRECRAWL_API_KEY is not set.');
    await store.patchJobMeta(jobId, {
      lastError: 'FIRECRAWL_API_KEY missing',
      nameExtractionDebug: {
        sourceUrl: job.input.url,
        finalUrl: job.input.url,
        zeroResultExplanation: 'Set FIRECRAWL_API_KEY in .env or choose Playwright fetch mode.',
        topContainers: [],
        strategyCounts: {},
        aiFallbackUsed: false,
        fetchEngine: 'firecrawl',
      },
    });
    await store.updateJobStatus(jobId, 'failed');
    return;
  }

  let browser: Browser | null = null;

  try {
    const cancelled: CancelSignal = () => store.isJobCancelled(jobId);

    const pendingRows = job.results.filter((r) => r.status === 'pending');
    const isResume = pendingRows.length > 0 && job.results.length > 0;

    if (isResume) {
      if (useFirecrawl) {
        await store.addLog(jobId, 'warn', 'Resume with Firecrawl mode is not supported; start a new job.');
        await store.updateJobStatus(jobId, 'failed');
        return;
      }
      const launch = await launchChromiumForScraper();
      browser = launch.browser;
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();
      await store.addLog(jobId, 'info', `Resuming job: ${pendingRows.length} pending rows`);
      await runEnrichmentPhase(jobId, page, cancelled);
      if (!(await Promise.resolve(cancelled()))) {
        await store.updateJobStatus(jobId, 'completed');
        await store.addLog(jobId, 'info', 'Scrape job completed');
        await store.patchJobMeta(jobId, { lastError: undefined });
      }
      return;
    }

    let candidates: Awaited<ReturnType<typeof extractCompanyNamesFromPage>>['candidates'];
    let debug: Awaited<ReturnType<typeof extractCompanyNamesFromPage>>['debug'];

    if (useFirecrawl) {
      await store.addLog(jobId, 'info', 'Phase 1: Fetching page via Firecrawl (markdown + main content)…');
      const fc = await firecrawlScrape(job.input.url);
      if (!fc.ok) {
        await store.addLog(jobId, 'error', fc.error);
        await store.patchJobMeta(jobId, {
          lastError: fc.error,
          nameExtractionDebug: {
            sourceUrl: job.input.url,
            finalUrl: job.input.url,
            zeroResultExplanation: fc.error,
            topContainers: [],
            strategyCounts: {},
            aiFallbackUsed: false,
            fetchEngine: 'firecrawl',
          },
        });
        await store.updateJobStatus(jobId, 'failed');
        return;
      }

      await store.addLog(jobId, 'info', `Firecrawl OK: ${fc.finalUrl.slice(0, 80)}…`);
      const out = await extractCompanyNamesFromFirecrawl(fc, job.input.url, {
        sourceUrl: job.input.url,
        maxCompanies: job.input.maxCompanies,
        enableAiFallback: job.input.enableAiNameFallback ?? false,
        cancelled,
        onLog: (msg) => store.addLog(jobId, 'info', msg),
      });
      candidates = out.candidates;
      debug = { ...out.debug, fetchEngine: 'firecrawl' };

      if (await Promise.resolve(cancelled())) {
        await store.addLog(jobId, 'warn', 'Job cancelled after name extraction');
        return;
      }
    } else {
      const launch = await launchChromiumForScraper();
      browser = launch.browser;
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();

      await store.addLog(jobId, 'info', 'Phase 1: Hybrid company-name extraction (Playwright)…');
      const out = await extractCompanyNamesFromPage(page, {
        sourceUrl: job.input.url,
        maxCompanies: job.input.maxCompanies,
        enableAiFallback: job.input.enableAiNameFallback ?? false,
        cancelled,
        onLog: (msg) => store.addLog(jobId, 'info', msg),
      });
      candidates = out.candidates;
      debug = { ...out.debug, fetchEngine: 'playwright' };

      if (await Promise.resolve(cancelled())) {
        await store.addLog(jobId, 'warn', 'Job cancelled during name extraction');
        return;
      }

      await store.patchJobMeta(jobId, { nameExtractionDebug: debug });

      if (debug.zeroResultExplanation) {
        await store.addLog(jobId, 'warn', debug.zeroResultExplanation);
      }

      const strategyLog = Object.entries(debug.strategyCounts)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      await store.addLog(
        jobId,
        'info',
        `Extracted ${candidates.length} company name(s). Strategies: ${strategyLog || 'none'}. AI: ${debug.aiFallbackUsed ? 'yes' : 'no'}`,
      );

      const visitWebsites = job.input.visitCompanyWebsites ?? false;
      const initialResults: CompanyResult[] = candidates.map((c, i) =>
        candidateToCompanyResult(c, i, { visitWebsites }),
      );

      await store.updateSummary(jobId, { companiesFound: initialResults.length });
      await store.setResults(jobId, initialResults);

      if (candidates.length === 0) {
        await store.addLog(jobId, 'info', 'Name extraction finished with zero rows (see debug panel / logs).');
      }

      await runWebsiteDiscoveryPhase(jobId, cancelled);
      await runEnrichmentPhase(jobId, page, cancelled);

      if (!(await Promise.resolve(cancelled()))) {
        await store.updateJobStatus(jobId, 'completed');
        await store.addLog(jobId, 'info', 'Scrape job completed');
        await store.patchJobMeta(jobId, { lastError: undefined });
      }
      return;
    }

    // Firecrawl path: meta + results + optional enrichment (needs browser)
    await store.patchJobMeta(jobId, { nameExtractionDebug: debug });

    if (debug.zeroResultExplanation) {
      await store.addLog(jobId, 'warn', debug.zeroResultExplanation);
    }

    const strategyLog = Object.entries(debug.strategyCounts)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    await store.addLog(
      jobId,
      'info',
      `Extracted ${candidates.length} company name(s). Strategies: ${strategyLog || 'none'}. AI: ${debug.aiFallbackUsed ? 'yes' : 'no'}`,
    );

    const visitWebsites = job.input.visitCompanyWebsites ?? false;
    const initialResults: CompanyResult[] = candidates.map((c, i) =>
      candidateToCompanyResult(c, i, { visitWebsites }),
    );

    await store.updateSummary(jobId, { companiesFound: initialResults.length });
    await store.setResults(jobId, initialResults);

    if (candidates.length === 0) {
      await store.addLog(jobId, 'info', 'Name extraction finished with zero rows (see debug panel / logs).');
    }

    await runWebsiteDiscoveryPhase(jobId, cancelled);

    if (visitWebsites && initialResults.some((r) => r.status === 'pending')) {
      const launch = await launchChromiumForScraper();
      browser = launch.browser;
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();
      await runEnrichmentPhase(jobId, page, cancelled);
    }

    if (!(await Promise.resolve(cancelled()))) {
      await store.updateJobStatus(jobId, 'completed');
      await store.addLog(jobId, 'info', 'Scrape job completed');
      await store.patchJobMeta(jobId, { lastError: undefined });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await store.patchJobMeta(jobId, { lastError: message });
    await store.addLog(jobId, 'error', `Job failed: ${message}`);
    await store.updateJobStatus(jobId, 'failed');
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function runWebsiteDiscoveryPhase(jobId: string, cancelled: CancelSignal) {
  const job = await store.getJob(jobId);
  if (!job?.input.enableSerperWebsiteDiscovery) return;
  if (!isSerperConfigured()) {
    await store.addLog(jobId, 'warn', 'Serper website discovery was enabled but SERPER_API_KEY is not set; skipping.');
    return;
  }

  const refreshed = await store.getJob(jobId);
  const allResults = refreshed?.results ?? [];
  const dominant = findDominantPlaceholderDomain(allResults);
  const rejectHosts = dominant ? [dominant] : undefined;

  const rows = allResults.filter((r) => {
    const w = r.companyWebsite?.trim();
    if (!w) return true;
    if (!dominant) return false;
    try {
      return normalizeDomain(w) === dominant;
    } catch {
      return false;
    }
  });

  if (rows.length === 0) {
    await store.addLog(jobId, 'info', 'Serper discovery: all rows already have a website URL; skipping.');
    await store.patchJobMeta(jobId, {
      websiteDiscoverySummary: {
        attempted: 0,
        resolvedDomainGuess: 0,
        resolvedSerper: 0,
        unresolved: 0,
        skippedAlreadyHadUrl: allResults.length,
      },
    });
    return;
  }

  const summary: WebsiteDiscoveryJobSummary = {
    attempted: rows.length,
    resolvedDomainGuess: 0,
    resolvedSerper: 0,
    unresolved: 0,
    skippedAlreadyHadUrl: allResults.length - rows.length,
  };

  if (dominant) {
    await store.addLog(
      jobId,
      'info',
      `Serper discovery: ${rows.length} row(s) — including ${summary.skippedAlreadyHadUrl} re-scan(s) for shared domain "${dominant}" (listing placeholder)`,
    );
  } else {
    await store.addLog(jobId, 'info', `Serper discovery: resolving websites for ${rows.length} row(s) (top-5 Serper scoring + domain guess)…`);
  }

  for (let i = 0; i < rows.length; i += SERPER_BATCH) {
    if (await Promise.resolve(cancelled())) {
      await store.addLog(jobId, 'warn', 'Job cancelled during Serper website discovery');
      break;
    }

    const batch = rows.slice(i, i + SERPER_BATCH);
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
          const noteLine = `Website cleared: was shared listing domain (${dominant}); ${found.detail}`;
          patch.notes = row.notes?.trim() ? `${row.notes.trim()} | ${noteLine}` : noteLine;
        } else if (found.detail) {
          const noteLine = `Website lookup: ${found.detail}`;
          patch.notes = row.notes?.trim() ? `${row.notes.trim()} | ${noteLine}` : noteLine;
        }
      }

      await store.updateResult(jobId, row.id, patch);
    }

    await store.recalcSummary(jobId);
    const last = batch[batch.length - 1];
    if (last) await store.patchJobMeta(jobId, { lastProcessedCompanyName: last.companyName });

    if (i + SERPER_BATCH < rows.length) {
      await sleep(DELAY_BETWEEN_SERPER_MS);
    }
  }

  await store.patchJobMeta(jobId, { websiteDiscoverySummary: summary });
  await store.addLog(
    jobId,
    'info',
    `Serper discovery done: domain guess ${summary.resolvedDomainGuess}, Serper ${summary.resolvedSerper}, unresolved ${summary.unresolved}`,
  );
}

async function runEnrichmentPhase(jobId: string, page: import('playwright').Page, cancelled: CancelSignal) {
  const job = await store.getJob(jobId);
  if (!job) return;
  const visitWebsites = job.input.visitCompanyWebsites ?? false;
  const refreshed = await store.getJob(jobId);
  const rowsToProcess = visitWebsites ? (refreshed?.results ?? []).filter((r) => r.status === 'pending') : [];

  if (rowsToProcess.length > 0) {
    await store.addLog(jobId, 'info', `Phase 2: Enriching ${rowsToProcess.length} companies...`);
  }

  for (let i = 0; i < rowsToProcess.length; i += CONCURRENCY) {
    if (await Promise.resolve(cancelled())) {
      await store.addLog(jobId, 'warn', 'Job cancelled during enrichment');
      break;
    }

    const batch = rowsToProcess.slice(i, i + CONCURRENCY);
    const enrichPromises = batch.map(async (row) => {
      const detailFromMeta = row.nameExtractionMeta?.detailUrl?.trim();
      const entry: DirectoryEntry = {
        name: row.companyName,
        url: row.directoryListingUrl,
        ...(detailFromMeta ? { detailUrl: detailFromMeta } : {}),
        existingCompanyWebsite: row.companyWebsite?.trim() || undefined,
        websiteDiscoveryMethod: row.websiteDiscoveryMeta?.method,
      };
      await store.updateResult(jobId, row.id, { status: 'scraping' });
      await store.addLog(jobId, 'info', `Enriching: ${row.companyName}`);

      try {
        const enrichPage = await page.context().newPage();
        enrichPage.setDefaultNavigationTimeout(ENRICHMENT_NAVIGATION_TIMEOUT_MS);
        enrichPage.setDefaultTimeout(Math.min(ENRICHMENT_NAVIGATION_TIMEOUT_MS, 25_000));
        try {
          const result = await runWithEnrichmentBudget(ENRICHMENT_ROW_BUDGET_MS, () =>
            enrichCompany(enrichPage, entry, visitWebsites, cancelled, row.id),
          );
          await store.updateResult(jobId, row.id, {
            ...result,
            id: row.id,
            nameExtractionMeta: row.nameExtractionMeta,
          });
        } finally {
          await enrichPage.close().catch(() => {});
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await store.patchJobMeta(jobId, { lastError: `${row.companyName}: ${message}` });
        await store.updateResult(jobId, row.id, {
          status: 'failed',
          error: message,
          notes: `Enrichment failed: ${message}`,
          needsReview: true,
          nameExtractionMeta: row.nameExtractionMeta,
        });
      }
    });

    await Promise.all(enrichPromises);
    await store.recalcSummary(jobId);
    const lastInBatch = batch[batch.length - 1];
    if (lastInBatch) {
      await store.patchJobMeta(jobId, {
        lastProcessedCompanyName: lastInBatch.companyName,
      });
    }
    await store.addLog(
      jobId,
      'info',
      `Processed ${Math.min(i + CONCURRENCY, rowsToProcess.length)}/${rowsToProcess.length}`,
    );

    if (i + CONCURRENCY < rowsToProcess.length) {
      await sleep(DELAY_BETWEEN_COMPANIES_MS);
    }
  }

  await store.recalcSummary(jobId);
}
