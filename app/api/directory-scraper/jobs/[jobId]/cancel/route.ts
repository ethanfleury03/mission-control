import { NextRequest, NextResponse } from 'next/server';
import { addLog, getJob, requestJobCancel, updateJobStatus } from '@/lib/directory-scraper/job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return NextResponse.json({ error: 'Job is already finished' }, { status: 400 });
  }

  const cancelledAt = new Date();
  if (job.status === 'queued') {
    await updateJobStatus(jobId, 'cancelled', {
      phase: 'cancelled',
      cancelRequestedAt: cancelledAt,
      finishedAt: cancelledAt,
    });
    await addLog(jobId, 'warn', 'Job cancelled before a worker started it.', {
      phase: 'cancelled',
      eventCode: 'JOB_CANCELLED',
    });
    return NextResponse.json({ ok: true, status: 'cancelled' });
  }

  await requestJobCancel(jobId);
  await addLog(jobId, 'warn', 'Cancellation requested; worker will stop at the next safe checkpoint.', {
    phase: job.phase,
    eventCode: 'JOB_CANCEL_REQUESTED',
  });
  return NextResponse.json({ ok: true, status: 'cancelling' });
}
