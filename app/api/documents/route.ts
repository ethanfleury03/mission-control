import { NextResponse } from 'next/server';

import { listDocuments } from '@/lib/rag/db';
import { withActiveUser } from '../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  try {
    return NextResponse.json({ documents: await listDocuments() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load RAG documents.' },
      { status: 500 },
    );
  }
}

export const GET = withActiveUser(GETHandler);
