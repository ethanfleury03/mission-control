import { NextRequest, NextResponse } from 'next/server';

import { getVideoGenerationRunById } from '@/lib/image-generation/video-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const run = await getVideoGenerationRunById(params.id, { refreshPending: true });

  if (!run) {
    return NextResponse.json({ error: 'Video generation run not found.' }, { status: 404 });
  }

  return NextResponse.json(run);
}
