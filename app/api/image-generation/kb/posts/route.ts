import { NextRequest, NextResponse } from 'next/server';

import { createImageStudioKBAsset } from '@/lib/image-generation/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }

  const files = form.getAll('files').filter((file): file is File => file instanceof File);
  const fallbackFile = form.get('file');
  if (fallbackFile instanceof File) files.push(fallbackFile);
  if (files.length === 0) {
    return NextResponse.json({ error: 'Reference post image is required.' }, { status: 400 });
  }

  try {
    const assets = await Promise.all(
      files.map(async (file, index) => {
        const fileName = 'name' in file && typeof file.name === 'string' ? file.name : `post-reference-${index + 1}.png`;
        return createImageStudioKBAsset({
          category: 'post',
          label: fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || `Post reference ${index + 1}`,
          fileName,
          mimeType: file.type || 'application/octet-stream',
          byteSize: file.size,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
      }),
    );
    return NextResponse.json({ assets }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not upload post reference.' },
      { status: 400 },
    );
  }
}
