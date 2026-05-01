import { NextRequest, NextResponse } from 'next/server';

import { getIngestionJob } from '@/lib/rag/db';
import { ingestLocalFile } from '@/lib/rag/ingestion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const job = await getIngestionJob(id);
    if (!job) return NextResponse.json({ error: 'Ingestion job not found.' }, { status: 404 });
    if (job.status !== 'failed') {
      return NextResponse.json({ error: 'Only failed jobs can be retried.' }, { status: 409 });
    }
    const sourcePath = typeof job.sourcePath === 'string' ? job.sourcePath : '';
    if (!sourcePath) {
      return NextResponse.json(
        { error: 'This job has no local source path to retry. Upload the file again from Ingest Manuals.' },
        { status: 409 },
      );
    }
    const result = await ingestLocalFile(sourcePath, { batchId: typeof job.batchId === 'string' ? job.batchId : undefined });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not retry ingestion job.' },
      { status: 500 },
    );
  }
}
