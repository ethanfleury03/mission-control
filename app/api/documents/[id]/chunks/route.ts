import { NextRequest, NextResponse } from 'next/server';

import { getDocumentChunks } from '@/lib/rag/db';
import { withActiveUser } from '../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return NextResponse.json({ chunks: await getDocumentChunks(id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load document chunks.' },
      { status: 500 },
    );
  }
}

export const GET = withActiveUser(GETHandler);
