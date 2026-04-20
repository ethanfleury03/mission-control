import { NextRequest, NextResponse } from 'next/server';
import { addLog, createJob, getAllJobs } from '@/lib/directory-scraper/job-store';
import type { ScrapeJobInput } from '@/lib/directory-scraper/types';
import { validateScrapeUrl } from '@/lib/directory-scraper/validate-scrape-url';
import { isFirecrawlConfigured } from '@/lib/directory-scraper/firecrawl-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await getAllJobs();
    return NextResponse.json(jobs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list jobs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const MAX_QUERY_PAGINATION_PAGES = 2000;

function shouldAutoEnableWebsiteDiscovery(input: ScrapeJobInput): boolean {
  return Boolean(input.paginationQuery && input.scrapeFetchMode === 'playwright' && input.enableAiNameFallback);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const fetchMode =
      body.scrapeFetchMode === 'firecrawl' || body.fetchMode === 'firecrawl' ? 'firecrawl' : 'playwright';

    const input: ScrapeJobInput = {
      url: body.url ?? '',
      maxCompanies: body.maxCompanies ? Number(body.maxCompanies) : undefined,
      visitCompanyWebsites: !!body.visitCompanyWebsites,
      enableAiNameFallback: !!body.enableAiNameFallback,
      exportTarget: body.exportTarget ?? 'csv',
      googleSheetId: body.googleSheetId ?? '',
      googleSheetTab: body.googleSheetTab ?? '',
      scrapeFetchMode: fetchMode,
      enableSerperWebsiteDiscovery: !!body.enableSerperWebsiteDiscovery,
    };

    const pq = body.paginationQuery;
    if (pq != null && typeof pq === 'object') {
      if (fetchMode === 'firecrawl') {
        return NextResponse.json(
          {
            error: 'Query pagination requires Playwright fetch mode (not Firecrawl).',
            code: 'PAGINATION_REQUIRES_PLAYWRIGHT',
          },
          { status: 400 },
        );
      }
      const param = typeof pq.param === 'string' ? pq.param.trim() : '';
      const from = Number(pq.from);
      const to = Number(pq.to);
      if (!param || !Number.isFinite(from) || !Number.isFinite(to)) {
        return NextResponse.json(
          {
            error: 'paginationQuery requires param (string), from (number), and to (number).',
            code: 'PAGINATION_INVALID',
          },
          { status: 400 },
        );
      }
      const fromI = Math.max(1, Math.floor(from));
      const toI = Math.floor(to);
      const pageCount = toI - fromI + 1;
      if (toI < fromI || pageCount > MAX_QUERY_PAGINATION_PAGES) {
        return NextResponse.json(
          {
            error: `Invalid pagination range: need 1 <= from <= to and at most ${MAX_QUERY_PAGINATION_PAGES} pages.`,
            code: 'PAGINATION_RANGE',
          },
          { status: 400 },
        );
      }
      input.paginationQuery = { param, from: fromI, to: toI };
    }

    if (shouldAutoEnableWebsiteDiscovery(input)) {
      input.enableSerperWebsiteDiscovery = true;
    }

    if (!input.url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (input.scrapeFetchMode === 'firecrawl' && !isFirecrawlConfigured()) {
      return NextResponse.json(
        { error: 'Firecrawl mode requires FIRECRAWL_API_KEY in server environment.', code: 'FIRECRAWL_NOT_CONFIGURED' },
        { status: 400 },
      );
    }

    const v = validateScrapeUrl(input.url);
    if (!v.ok) {
      return NextResponse.json(
        { error: v.error ?? 'URL not allowed', code: 'URL_BLOCKED' },
        { status: 400 },
      );
    }
    if (v.normalizedUrl) input.url = v.normalizedUrl;

    const job = await createJob(input);
    await addLog(job.id, 'info', `Job queued for ${input.url}`, {
      phase: 'queued',
      eventCode: 'JOB_QUEUED',
    });
    if (shouldAutoEnableWebsiteDiscovery(input)) {
      await addLog(
        job.id,
        'info',
        'Homepage discovery will run automatically after paginated AI extraction so company URLs can fill in row-by-row.',
        {
          phase: 'queued',
          eventCode: 'WEBSITE_DISCOVERY_AUTO_ENABLED',
        },
      );
    }

    return NextResponse.json(job, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
