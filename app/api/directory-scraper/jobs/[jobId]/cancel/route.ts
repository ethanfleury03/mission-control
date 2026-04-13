import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJobStatus, addLog } from '@/lib/directory-scraper/job-store';

export async function POST(_request: NextRequest, context: any) {
  const { jobId } = await context.params;
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.status !== 'running' && job.status !== 'queued') {
    return NextResponse.json({ error: 'Job is not running' }, { status: 400 });
  }
  updateJobStatus(jobId, 'cancelled');
  addLog(jobId, 'warn', 'Job cancelled by user');
  return NextResponse.json({ ok: true });
}
