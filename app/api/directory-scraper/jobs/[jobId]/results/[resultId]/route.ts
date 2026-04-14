import { NextRequest, NextResponse } from 'next/server';
import { deleteResult } from '@/lib/directory-scraper/job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string; resultId: string }> },
) {
  const { jobId, resultId } = await context.params;
  const removed = await deleteResult(jobId, resultId);
  if (!removed) return NextResponse.json({ error: 'Result not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
