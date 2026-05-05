import { NextRequest, NextResponse } from 'next/server';

import { deleteDocument, getDocument } from '@/lib/rag/db';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const document = await getDocument(id);
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load RAG document.' },
      { status: 500 },
    );
  }
}

async function DELETEHandler(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const deleted = await deleteDocument(id);
    if (!deleted) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete RAG document.' },
      { status: 500 },
    );
  }
}

export const GET = withActiveUser(GETHandler);
export const DELETE = withActiveUser(DELETEHandler);
