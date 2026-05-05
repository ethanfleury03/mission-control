import { NextRequest, NextResponse } from 'next/server';

import { inlineContentDisposition } from '@/app/api/_lib/content-disposition';
import { getImageStudioKBAsset } from '@/lib/image-generation/service';
import { withActiveUser } from '../../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(
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
      'Content-Disposition': inlineContentDisposition(asset.fileName, 'kb-asset'),
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = withActiveUser(GETHandler);
