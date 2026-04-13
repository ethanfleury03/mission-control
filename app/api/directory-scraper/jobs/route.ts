import { NextRequest, NextResponse } from 'next/server';
import { createJob, getAllJobs } from '@/lib/directory-scraper/job-store';
import { runScrapeJob } from '@/lib/directory-scraper/scrape-directory';
import type { ScrapeJobInput } from '@/lib/directory-scraper/types';
import { validateScrapeUrl } from '@/lib/directory-scraper/validate-scrape-url';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input: ScrapeJobInput = {
      url: body.url ?? '',
      maxCompanies: body.maxCompanies ? Number(body.maxCompanies) : undefined,
      visitCompanyWebsites: !!body.visitCompanyWebsites,
      exportTarget: body.exportTarget ?? 'csv',
      googleSheetId: body.googleSheetId ?? '',
      googleSheetTab: body.googleSheetTab ?? '',
      mockMode: !!body.mockMode,
    };

    if (!input.url && !input.mockMode) {
      return NextResponse.json({ error: 'URL is required (or enable mock mode)' }, { status: 400 });
    }

    if (!input.mockMode && input.url) {
      const v = validateScrapeUrl(input.url);
      if (!v.ok) {
        return NextResponse.json(
          { error: v.error ?? 'URL not allowed', code: 'URL_BLOCKED' },
          { status: 400 },
        );
      }
      if (v.normalizedUrl) input.url = v.normalizedUrl;
    }

    const job = await createJob(input);

    runScrapeJob(job.id).catch((err) => {
      console.error(`[directory-scraper] job ${job.id} crashed:`, err);
    });

    return NextResponse.json(job, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
