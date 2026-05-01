import { NextRequest, NextResponse } from 'next/server';

import { listIngestionJobs } from '@/lib/rag/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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
