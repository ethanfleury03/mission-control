import { NextRequest, NextResponse } from 'next/server';

import { getIngestionJob } from '@/lib/rag/db';
import { withActiveUser } from '../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const job = await getIngestionJob(id);
    if (!job) return NextResponse.json({ error: 'Ingestion job not found.' }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load ingestion job.' },
      { status: 500 },
    );
  }
}

export const GET = withActiveUser(GETHandler);
