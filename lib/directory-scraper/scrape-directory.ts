import { chromium, type Browser, type Page } from 'playwright';
import type { ScrapeJob, CompanyResult } from './types';
import * as store from './job-store';
import { extractDirectoryEntries } from './extract-directory-entries';
import { enrichCompany } from './enrich-company';
import { dedupeCompanies, sleep } from './utils';
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
  }));
}

export async function runScrapeJob(jobId: string): Promise<void> {
  const job = store.getJob(jobId);
  if (!job) return;

  store.updateJobStatus(jobId, 'running');
  store.addLog(jobId, 'info', `Starting scrape job for: ${job.input.url || 'MOCK MODE'}`);

  if (job.input.mockMode || !job.input.url) {
    store.addLog(jobId, 'info', 'Running in mock mode');
    const results = mockResults();
    store.setResults(jobId, results);
    store.recalcSummary(jobId);
    store.addLog(jobId, 'info', `Mock data loaded: ${results.length} companies`);
    store.updateJobStatus(jobId, 'completed');
    return;
  }

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    const cancelled = () => store.isJobCancelled(jobId);

    // Phase 1: Extract directory entries
    store.addLog(jobId, 'info', 'Phase 1: Extracting directory entries...');
    const entries = await extractDirectoryEntries(page, job.input.url, cancelled, job.input.maxCompanies);

    if (cancelled()) {
      store.addLog(jobId, 'warn', 'Job cancelled during directory extraction');
      return;
    }

    const deduped = dedupeCompanies(entries);
    const limited = job.input.maxCompanies ? deduped.slice(0, job.input.maxCompanies) : deduped;

    store.addLog(jobId, 'info', `Found ${deduped.length} unique entries, processing ${limited.length}`);
    store.updateSummary(jobId, { companiesFound: limited.length });

    // Initialize results as pending
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
      confidence: 'low' as const,
      status: 'pending' as const,
    }));
    store.setResults(jobId, initialResults);

    // Phase 2: Enrich each company
    store.addLog(jobId, 'info', `Phase 2: Enriching ${limited.length} companies...`);
    const visitWebsites = job.input.visitCompanyWebsites ?? false;

    for (let i = 0; i < limited.length; i += CONCURRENCY) {
      if (cancelled()) {
        store.addLog(jobId, 'warn', 'Job cancelled during enrichment');
        break;
      }

      const batch = limited.slice(i, i + CONCURRENCY);
      const enrichPromises = batch.map(async (entry, batchIdx) => {
        const globalIdx = i + batchIdx;
        store.updateResult(jobId, initialResults[globalIdx].id, { status: 'scraping' });

        try {
          const enrichPage = await context.newPage();
          try {
            const result = await enrichCompany(enrichPage, entry, visitWebsites, cancelled);
            store.updateResult(jobId, initialResults[globalIdx].id, {
              ...result,
              id: initialResults[globalIdx].id,
            });
          } finally {
            await enrichPage.close();
          }
        } catch (err: any) {
          store.updateResult(jobId, initialResults[globalIdx].id, {
            status: 'failed',
            error: err?.message ?? 'Unknown error',
            notes: `Enrichment failed: ${err?.message}`,
          });
        }
      });

      await Promise.all(enrichPromises);
      store.recalcSummary(jobId);
      store.addLog(jobId, 'info', `Processed ${Math.min(i + CONCURRENCY, limited.length)}/${limited.length}`);

      if (i + CONCURRENCY < limited.length) {
        await sleep(DELAY_BETWEEN_COMPANIES_MS);
      }
    }

    store.recalcSummary(jobId);

    if (!cancelled()) {
      store.updateJobStatus(jobId, 'completed');
      store.addLog(jobId, 'info', 'Scrape job completed');
    }
  } catch (err: any) {
    store.addLog(jobId, 'error', `Job failed: ${err?.message}`);
    store.updateJobStatus(jobId, 'failed');
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
