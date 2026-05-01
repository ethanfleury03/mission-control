import { NextRequest, NextResponse } from 'next/server';

import { cancelIngestionJob } from '@/lib/rag/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const canceled = await cancelIngestionJob(id);
    if (!canceled) {
      return NextResponse.json(
        { error: 'This job cannot be canceled because it already finished or does not exist.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not cancel ingestion job.' },
      { status: 500 },
    );
  }
}
