import { NextRequest, NextResponse } from 'next/server';

import { inlineContentDisposition } from '@/app/api/_lib/content-disposition';
import { getImageGenerationMachineImage } from '@/lib/image-generation/service';
import { withActiveUser } from '../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const image = await getImageGenerationMachineImage(params.id);

  if (!image) {
    return NextResponse.json({ error: 'Machine image not found.' }, { status: 404 });
  }

  return new NextResponse(Buffer.from(image.bytes) as BodyInit, {
    headers: {
      'Content-Type': image.mimeType,
      'Content-Disposition': inlineContentDisposition(image.fileName, 'machine-reference'),
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = withActiveUser(GETHandler);
