import { NextRequest, NextResponse } from 'next/server';

import { getDocumentChunks } from '@/lib/rag/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
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
