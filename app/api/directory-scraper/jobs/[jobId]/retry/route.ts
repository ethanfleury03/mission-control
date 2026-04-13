import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateResult, addLog } from '@/lib/directory-scraper/job-store';

export async function POST(request: NextRequest, context: any) {
  const { jobId } = await context.params;
  const job = getJob(jobId);
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
      updateResult(jobId, cid, { status: 'pending', error: undefined, notes: 'Queued for retry' });
      resetCount++;
    }
  }

  addLog(jobId, 'info', `Reset ${resetCount} failed rows for retry`);
  return NextResponse.json({ resetCount });
}
