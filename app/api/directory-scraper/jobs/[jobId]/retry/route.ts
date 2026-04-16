import { NextRequest, NextResponse } from 'next/server';
import { addLog, clearJobCancellation, getJob, resumeJob, updateResult, updateJobStatus } from '@/lib/directory-scraper/job-store';

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

  const resumePhase = job.input.visitCompanyWebsites
    ? 'enriching'
    : job.input.enableSerperWebsiteDiscovery
      ? 'discovering_websites'
      : 'exporting_optional';

  await clearJobCancellation(jobId);
  await resumeJob(jobId);
  await updateJobStatus(jobId, 'queued', {
    phase: resumePhase,
    errorCode: null,
    errorMessage: null,
    nextRetryAt: null,
    finishedAt: null,
  });
  await addLog(jobId, 'info', `Reset ${resetCount} failed rows and re-queued the job for worker pickup.`, {
    phase: resumePhase,
    eventCode: 'JOB_REQUEUED',
  });

  return NextResponse.json({ resetCount, resumed: true, status: 'queued' });
}
