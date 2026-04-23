import { NextResponse } from 'next/server';

import { getImageStudioKBResponse } from '@/lib/image-generation/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getImageStudioKBResponse());
}
