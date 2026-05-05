import { NextResponse } from 'next/server';
import { syncHubSpotGeoSnapshots } from '@/lib/geo-intelligence/hubspot-sync';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler() {
  try {
    const result = await syncHubSpotGeoSnapshots();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HubSpot sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withActiveUser(POSTHandler);
