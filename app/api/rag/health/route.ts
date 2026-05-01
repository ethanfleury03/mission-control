import { NextResponse } from 'next/server';

import { collectRagHealth } from '@/lib/rag/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await collectRagHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
