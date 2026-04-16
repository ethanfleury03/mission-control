import { NextRequest, NextResponse } from 'next/server';
import { deleteJob, getJob, getJobSnapshot } from '@/lib/directory-scraper/job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const { searchParams } = new URL(request.url);
  const full = searchParams.get('full') === '1';
  const offset = Number(searchParams.get('resultsOffset') ?? '0');
  const limit = Number(searchParams.get('resultsLimit') ?? '0');
  const logsLimit = Number(searchParams.get('logsLimit') ?? '0');

  if (full) {
    const job = await getJob(jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json(job);
  }

  const snap =
    limit > 0
      ? await getJobSnapshot(jobId, {
          resultsOffset: Number.isFinite(offset) ? offset : 0,
          resultsLimit: Number.isFinite(limit) ? limit : 150,
          logsLimit: Number.isFinite(logsLimit) && logsLimit > 0 ? logsLimit : undefined,
        })
      : await getJobSnapshot(jobId, {
          logsLimit: Number.isFinite(logsLimit) && logsLimit > 0 ? logsLimit : undefined,
        });

  if (!snap) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json(snap);
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const deleted = await deleteJob(jobId);
  if (!deleted) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
