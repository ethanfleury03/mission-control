import { NextRequest, NextResponse } from 'next/server';

import { getVideoGenerationRunSourceImage } from '@/lib/image-generation/video-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const image = await getVideoGenerationRunSourceImage(params.id);

  if (!image) {
    return NextResponse.json({ error: 'Video source image not found.' }, { status: 404 });
  }

  return new NextResponse(Buffer.from(image.bytes) as BodyInit, {
    headers: {
      'Content-Type': image.mimeType,
      'Content-Disposition': `inline; filename="${image.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
