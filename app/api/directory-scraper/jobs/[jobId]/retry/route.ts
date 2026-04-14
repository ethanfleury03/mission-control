import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateResult, addLog, resumeJob } from '@/lib/directory-scraper/job-store';
import { runScrapeJob } from '@/lib/directory-scraper/scrape-directory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const companyIds: string[] = body.companyIds ?? [];

  if (companyIds.length === 0) {
    return NextResponse.json({ error: 'companyIds required' }, { status: 400 });
  }

  let resetCount = 0;
  for (const cid of companyIds) {
    const found = job.results.find((r) => r.id === cid);
    if (found && found.status === 'failed') {
      await updateResult(jobId, cid, {
        status: 'pending',
        error: undefined,
        notes: 'Queued for retry',
      });
      resetCount++;
    }
  }

  if (resetCount === 0) {
    return NextResponse.json({ error: 'No matching failed rows to retry' }, { status: 400 });
  }

  await addLog(jobId, 'info', `Reset ${resetCount} failed rows for retry; resuming scrape…`);

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    await resumeJob(jobId);
  }

  runScrapeJob(jobId).catch((err) => {
    console.error(`[directory-scraper] retry job ${jobId} crashed:`, err);
  });

  return NextResponse.json({ resetCount, resumed: true });
}
