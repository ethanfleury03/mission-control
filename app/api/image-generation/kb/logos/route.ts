import { NextRequest, NextResponse } from 'next/server';

import { createImageStudioKBAsset } from '@/lib/image-generation/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }

  const label = String(form.get('label') ?? '').trim();
  const file = form.get('file');
  if (!label) {
    return NextResponse.json({ error: 'Logo label is required.' }, { status: 400 });
  }
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Logo image is required.' }, { status: 400 });
  }

  try {
    const created = await createImageStudioKBAsset({
      category: 'logo',
      label,
      fileName: 'name' in file && typeof file.name === 'string' ? file.name : 'logo.png',
      mimeType: file.type || 'application/octet-stream',
      byteSize: file.size,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not upload logo.' },
      { status: 400 },
    );
  }
}
