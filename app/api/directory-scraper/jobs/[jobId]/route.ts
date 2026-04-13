import { NextRequest, NextResponse } from 'next/server';
import { getJob, deleteJob } from '@/lib/directory-scraper/job-store';

export async function GET(_request: NextRequest, context: any) {
  const { jobId } = await context.params;
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json(job);
}

export async function DELETE(_request: NextRequest, context: any) {
  const { jobId } = await context.params;
  const deleted = deleteJob(jobId);
  if (!deleted) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
