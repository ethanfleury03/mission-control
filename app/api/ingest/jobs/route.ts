import { NextRequest, NextResponse } from 'next/server';

import { listIngestionJobs } from '@/lib/rag/db';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get('limit') || 100);
    return NextResponse.json({ jobs: await listIngestionJobs(Number.isFinite(limit) ? limit : 100) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load ingestion jobs.' },
      { status: 500 },
    );
  }
}

export const GET = withActiveUser(GETHandler);
