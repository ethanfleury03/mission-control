import { NextRequest, NextResponse } from 'next/server';

import { createManual, getManuals } from '@/lib/manuals/service';
import { withActiveUser } from '../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  return NextResponse.json({ manuals: await getManuals() });
}

async function POSTHandler(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }

  const name = String(form.get('name') ?? '').trim();
  const file = form.get('file');
  if (!name) {
    return NextResponse.json({ error: 'Manual name is required.' }, { status: 400 });
  }
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Manual file is required.' }, { status: 400 });
  }

  try {
    const created = await createManual({
      name,
      fileName: 'name' in file && typeof file.name === 'string' ? file.name : 'manual',
      mimeType: file.type || 'application/octet-stream',
      byteSize: file.size,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not upload manual.' },
      { status: 400 },
    );
  }
}

export const GET = withActiveUser(GETHandler);
export const POST = withActiveUser(POSTHandler);
