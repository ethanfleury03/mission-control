import { NextRequest, NextResponse } from 'next/server';

import { getImageStudioKBAsset } from '@/lib/image-generation/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const asset = await getImageStudioKBAsset(params.id);

  if (!asset) {
    return NextResponse.json({ error: 'KB asset not found.' }, { status: 404 });
  }

  return new NextResponse(Buffer.from(asset.bytes) as BodyInit, {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Disposition': `inline; filename="${asset.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
