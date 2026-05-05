import { NextRequest, NextResponse } from 'next/server';

import { createRagResumableUpload } from '@/lib/rag/gcsUpload';
import { withActiveUser } from '../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Expected JSON body.' }, { status: 400 });
  }

  const filename = normalizeString(body.filename);
  const contentType = normalizeString(body.contentType) || 'application/octet-stream';
  const sizeBytes = Number(body.sizeBytes || 0);
  if (!filename) return NextResponse.json({ error: 'filename is required.' }, { status: 400 });
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return NextResponse.json({ error: 'sizeBytes must be a positive number.' }, { status: 400 });

  try {
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || null;
    const target = await createRagResumableUpload({ filename, contentType, sizeBytes, origin });
    return NextResponse.json(target);
  } catch (error) {
    return NextResponse.json({ error: humanUploadSetupError(error) }, { status: 400 });
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function humanUploadSetupError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/RAG_UPLOAD_BUCKET/i.test(message)) {
    return 'Large-file uploads are not configured yet. Ask an admin to set RAG_UPLOAD_BUCKET for staging.';
  }
  if (/permission|forbidden|denied/i.test(message)) {
    return 'The app does not have permission to create large-file upload sessions in Cloud Storage.';
  }
  return message || 'Could not create a large-file upload session.';
}

export const POST = withActiveUser(POSTHandler);
