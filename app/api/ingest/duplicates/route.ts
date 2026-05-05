import { NextRequest, NextResponse } from 'next/server';

import { findDocumentByHash } from '@/lib/rag/db';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const hashes = Array.isArray(body.hashes) ? body.hashes.filter((item: unknown) => typeof item === 'string') : [];
  const duplicates = [];
  for (const hash of hashes) {
    const document = await findDocumentByHash(hash);
    if (document) {
      duplicates.push({ hash, document });
    }
  }
  return NextResponse.json({ duplicates });
}

export const POST = withActiveUser(POSTHandler);
