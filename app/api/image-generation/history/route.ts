import { NextResponse } from 'next/server';

import { getImageGenerationHistory } from '@/lib/image-generation/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    runs: await getImageGenerationHistory(),
  });
}
