import { NextRequest, NextResponse } from 'next/server';
import { deleteResult } from '@/lib/directory-scraper/job-store';
import { withActiveUser } from '../../../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function DELETEHandler(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string; resultId: string }> },
) {
  const { jobId, resultId } = await context.params;
  const removed = await deleteResult(jobId, resultId);
  if (!removed) return NextResponse.json({ error: 'Result not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const DELETE = withActiveUser(DELETEHandler);
