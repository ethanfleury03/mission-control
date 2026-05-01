import fs from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';

import { inlineContentDisposition } from '@/app/api/_lib/content-disposition';
import { getDocument } from '@/lib/rag/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const document = await getDocument(id);
  if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const filePath = document.sourcePath || document.originalPath;
  if (!filePath) return NextResponse.json({ error: 'No source file path recorded for this document.' }, { status: 404 });

  try {
    const bytes = await fs.readFile(filePath);
    return new NextResponse(Buffer.from(bytes) as BodyInit, {
      headers: {
        'Content-Type': contentTypeFromFilename(document.filename),
        'Content-Disposition': inlineContentDisposition(document.filename, 'rag-document'),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not open source document.' },
      { status: 404 },
    );
  }
}

function contentTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown; charset=utf-8';
  if (lower.endsWith('.csv')) return 'text/csv; charset=utf-8';
  if (lower.endsWith('.tsv')) return 'text/tab-separated-values; charset=utf-8';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}
