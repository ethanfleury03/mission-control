import { NextRequest, NextResponse } from 'next/server';

import { updateDocumentMetadata } from '@/lib/rag/db';
import { withActiveUser } from '../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function PATCHHandler(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    const document = await updateDocumentMetadata(id, {
      title: typeof body.title === 'string' ? body.title : undefined,
      productFamily: typeof body.productFamily === 'string' ? body.productFamily : undefined,
      productModel: typeof body.productModel === 'string' ? body.productModel : undefined,
      documentType: typeof body.documentType === 'string' ? body.documentType : undefined,
      version: typeof body.version === 'string' ? body.version : undefined,
      softwareVersion: typeof body.softwareVersion === 'string' ? body.softwareVersion : undefined,
      revisionDate:
        typeof body.revisionDate === 'string'
          ? body.revisionDate.trim() || null
          : body.revisionDate === null
            ? null
            : undefined,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
    });
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update metadata.' },
      { status: 500 },
    );
  }
}

export const PATCH = withActiveUser(PATCHHandler);
