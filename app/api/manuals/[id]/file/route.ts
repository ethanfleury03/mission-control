import { NextRequest, NextResponse } from 'next/server';

import { inlineContentDisposition } from '@/app/api/_lib/content-disposition';
import { getManualFile } from '@/lib/manuals/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const manual = await getManualFile(params.id);

  if (!manual) {
    return NextResponse.json({ error: 'Manual not found.' }, { status: 404 });
  }

  return new NextResponse(Buffer.from(manual.bytes) as BodyInit, {
    headers: {
      'Content-Type': manual.mimeType,
      'Content-Disposition': inlineContentDisposition(manual.fileName, 'manual'),
      'Cache-Control': 'no-store',
    },
  });
}
