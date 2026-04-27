import { NextRequest, NextResponse } from 'next/server';

import { getImageGenerationHistory } from '@/lib/image-generation/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limitValue = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitValue) ? limitValue : undefined;

  return NextResponse.json({
    runs: await getImageGenerationHistory(limit),
  });
}
