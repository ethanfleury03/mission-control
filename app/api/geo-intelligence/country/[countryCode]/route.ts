import { NextRequest, NextResponse } from 'next/server';
import { buildGeoCountryDrilldownSnapshot } from '@/lib/geo-intelligence/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ countryCode: string }> },
) {
  const { countryCode } = await context.params;
  const { searchParams } = new URL(request.url);
  const snapshot = await buildGeoCountryDrilldownSnapshot(countryCode, {
    ownerId: searchParams.get('ownerId') ?? '',
    lifecycleStage: searchParams.get('lifecycleStage') ?? '',
    leadStatus: searchParams.get('leadStatus') ?? '',
    persona: searchParams.get('persona') ?? '',
    countryIsoA3: '',
  });

  if (!snapshot) {
    return NextResponse.json({ error: 'Country not found' }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}
