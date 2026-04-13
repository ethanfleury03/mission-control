import type { Browser } from 'playwright';
import type { CompanyResult, DirectoryEntry } from './types';
import * as store from './job-store';
import { extractDirectoryEntries, type CancelSignal } from './extract-directory-entries';
import { enrichCompany } from './enrich-company';
import { dedupeDirectoryEntries, sleep } from './utils';
import { launchChromiumForScraper } from './playwright-launch';
import { validateScrapeUrl } from './validate-scrape-url';
import { v4 as uuid } from 'uuid';

const CONCURRENCY = 2;
const DELAY_BETWEEN_COMPANIES_MS = 1200;

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

  return companies.map((c) => ({
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
    await store.patchJobMeta(jobId, { lastError: seedCheck.error });
    await store.updateJobStatus(jobId, 'failed');
    return;
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

    const cancelled: CancelSignal = () => store.isJobCancelled(jobId);

    const pendingRows = job.results.filter((r) => r.status === 'pending');
    const isResume = pendingRows.length > 0 && job.results.length > 0;

    let limited: DirectoryEntry[] = [];

    if (isResume) {
      await store.addLog(jobId, 'info', `Resuming job: ${pendingRows.length} pending rows`);
    } else {
      await store.addLog(jobId, 'info', 'Phase 1: Extracting directory entries...');
      const entries = await extractDirectoryEntries(page, job.input.url, cancelled, job.input.maxCompanies);

      if (await Promise.resolve(cancelled())) {
        await store.addLog(jobId, 'warn', 'Job cancelled during directory extraction');
        return;
      }

      const deduped = dedupeDirectoryEntries(entries).filter((e) => {
        const a = validateScrapeUrl(e.url);
        const d = e.detailUrl ? validateScrapeUrl(e.detailUrl) : { ok: true as const };
        return a.ok && d.ok;
      });
      limited = job.input.maxCompanies ? deduped.slice(0, job.input.maxCompanies) : deduped;

      await store.addLog(jobId, 'info', `Found ${deduped.length} unique entries, processing ${limited.length}`);
      await store.updateSummary(jobId, { companiesFound: limited.length });

      const initialResults: CompanyResult[] = limited.map((entry) => ({
        id: uuid(),
        companyName: entry.name,
        directoryListingUrl: entry.url,
        companyWebsite: '',
        contactName: '',
        email: '',
        phone: '',
        address: '',
        contactPageUrl: '',
        socialLinks: '',
        notes: '',
        confidence: 'low',
        status: 'pending',
        needsReview: false,
      }));
      await store.setResults(jobId, initialResults);
    }

    const visitWebsites = job.input.visitCompanyWebsites ?? false;

    const refreshed = await store.getJob(jobId);
    const rowsToProcess = (refreshed?.results ?? []).filter((r) => r.status === 'pending');

    await store.addLog(jobId, 'info', `Phase 2: Enriching ${rowsToProcess.length} companies...`);

    for (let i = 0; i < rowsToProcess.length; i += CONCURRENCY) {
      if (await Promise.resolve(cancelled())) {
        await store.addLog(jobId, 'warn', 'Job cancelled during enrichment');
        break;
      }

      const batch = rowsToProcess.slice(i, i + CONCURRENCY);
      const enrichPromises = batch.map(async (row, batchIdx) => {
        const entry: DirectoryEntry = {
          name: row.companyName,
          url: row.directoryListingUrl,
          detailUrl: row.directoryListingUrl,
        };
        await store.updateResult(jobId, row.id, { status: 'scraping' });

        try {
          const enrichPage = await context.newPage();
          try {
            const result = await enrichCompany(enrichPage, entry, visitWebsites, cancelled, row.id);
            await store.updateResult(jobId, row.id, {
              ...result,
              id: row.id,
            });
          } finally {
            await enrichPage.close();
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          await store.patchJobMeta(jobId, { lastError: `${row.companyName}: ${message}` });
          await store.updateResult(jobId, row.id, {
            status: 'failed',
            error: message,
            notes: `Enrichment failed: ${message}`,
            needsReview: true,
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
