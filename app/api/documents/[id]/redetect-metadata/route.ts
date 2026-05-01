import { NextRequest, NextResponse } from 'next/server';

import { getDocument } from '@/lib/rag/db';
import { redetectDocumentMetadata } from '@/lib/rag/ingestion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await redetectDocumentMetadata(id);
    return NextResponse.json({ document: await getDocument(id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not re-detect metadata.' },
      { status: 500 },
    );
  }
}
