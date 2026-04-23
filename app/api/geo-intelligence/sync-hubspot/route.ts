import { NextResponse } from 'next/server';
import { syncHubSpotGeoSnapshots } from '@/lib/geo-intelligence/hubspot-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await syncHubSpotGeoSnapshots();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HubSpot sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
