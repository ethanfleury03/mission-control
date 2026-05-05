import { NextRequest, NextResponse } from 'next/server';

import { reingestDocument } from '@/lib/rag/ingestion';
import { withActiveUser } from '../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const result = await reingestDocument(id);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not re-ingest document.' },
      { status: 500 },
    );
  }
}

export const POST = withActiveUser(POSTHandler);
