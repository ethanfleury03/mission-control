import { NextRequest, NextResponse } from 'next/server';

import { ingestFolder, ingestUploadedFile } from '@/lib/rag/ingestion';
import { withActiveUser } from '../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      const folderPath = String(form.get('folderPath') || '').trim();
      const recursive = String(form.get('recursive') || '').toLowerCase() === 'true';

      if (file && file instanceof Blob) {
        const filename = 'name' in file && typeof file.name === 'string' ? file.name : 'document';
        const result = await ingestUploadedFile({
          filename,
          mimeType: file.type || 'application/octet-stream',
          bytes: Buffer.from(await file.arrayBuffer()),
        });
        return NextResponse.json({ results: [result] }, { status: 201 });
      }

      if (folderPath) {
        const results = await ingestFolder({ folderPath, recursive });
        return NextResponse.json({ results }, { status: 201 });
      }

      return NextResponse.json({ error: 'Provide a file upload or local folderPath.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const folderPath = typeof body.folderPath === 'string' ? body.folderPath.trim() : '';
    if (!folderPath) {
      return NextResponse.json({ error: 'Provide a local folderPath or multipart file.' }, { status: 400 });
    }
    const results = await ingestFolder({ folderPath, recursive: Boolean(body.recursive) });
    return NextResponse.json({ results }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not ingest document.' },
      { status: 500 },
    );
  }
}

export const POST = withActiveUser(POSTHandler);
