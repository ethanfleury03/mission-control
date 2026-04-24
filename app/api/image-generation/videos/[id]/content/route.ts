import { NextRequest, NextResponse } from 'next/server';

import { getVideoGenerationRunContent } from '@/lib/image-generation/video-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const video = await getVideoGenerationRunContent(params.id);

  if (!video) {
    return NextResponse.json({ error: 'Generated video not found.' }, { status: 404 });
  }

  return new NextResponse(Buffer.from(video.bytes) as BodyInit, {
    headers: {
      'Content-Type': video.mimeType,
      'Content-Disposition': `inline; filename="${video.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
