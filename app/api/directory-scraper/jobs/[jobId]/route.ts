import { NextRequest, NextResponse } from 'next/server';
import { getJob, deleteJob } from '@/lib/directory-scraper/job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json(job);
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const deleted = await deleteJob(jobId);
  if (!deleted) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
