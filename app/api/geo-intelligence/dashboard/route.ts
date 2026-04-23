import { NextRequest, NextResponse } from 'next/server';
import { buildGeoDashboardSnapshot } from '@/lib/geo-intelligence/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const snapshot = await buildGeoDashboardSnapshot({
    ownerId: searchParams.get('ownerId') ?? '',
    lifecycleStage: searchParams.get('lifecycleStage') ?? '',
    leadStatus: searchParams.get('leadStatus') ?? '',
    persona: searchParams.get('persona') ?? '',
  });

  return NextResponse.json(snapshot);
}
