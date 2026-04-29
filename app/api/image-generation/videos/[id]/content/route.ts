import { NextRequest, NextResponse } from 'next/server';

import { inlineContentDisposition } from '@/app/api/_lib/content-disposition';
import { getVideoGenerationRunContent } from '@/lib/image-generation/video-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSafeVideoMimeType(mimeType: string, fileName: string): string {
  if (mimeType.startsWith('video/')) return mimeType;
  if (fileName.toLowerCase().endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const video = await getVideoGenerationRunContent(params.id);

  if (!video) {
    return NextResponse.json({ error: 'Generated video not found.' }, { status: 404 });
  }

  const buffer = Buffer.from(video.bytes);
  const contentType = getSafeVideoMimeType(video.mimeType, video.fileName);
  const range = request.headers.get('range');

  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${buffer.length}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    const hasStart = Boolean(match[1]);
    const hasEnd = Boolean(match[2]);
    if (!hasStart && !hasEnd) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${buffer.length}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    const requestedStart = hasStart ? Number.parseInt(match[1], 10) : 0;
    const requestedEnd = hasEnd ? Number.parseInt(match[2], 10) : buffer.length - 1;
    const suffixLength = !hasStart && hasEnd ? requestedEnd : null;
    const start =
      suffixLength !== null && Number.isFinite(suffixLength)
        ? Math.max(buffer.length - suffixLength, 0)
        : requestedStart;
    const end =
      suffixLength !== null && Number.isFinite(suffixLength)
        ? buffer.length - 1
        : Math.min(requestedEnd, buffer.length - 1);

    if (start < 0 || end < start || start >= buffer.length) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${buffer.length}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    const chunk = buffer.subarray(start, end + 1);
    return new NextResponse(chunk as BodyInit, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': inlineContentDisposition(video.fileName, 'generated-video'),
        'Cache-Control': 'no-store',
      },
    });
  }

  return new NextResponse(buffer as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': inlineContentDisposition(video.fileName, 'generated-video'),
      'Cache-Control': 'no-store',
    },
  });
}
