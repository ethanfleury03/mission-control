import { NextResponse } from 'next/server';

import { listDocuments } from '@/lib/rag/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ documents: await listDocuments() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load RAG documents.' },
      { status: 500 },
    );
  }
}
