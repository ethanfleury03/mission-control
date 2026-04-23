import { NextRequest, NextResponse } from 'next/server';
import { buildGeoDashboardSnapshot } from '@/lib/geo-intelligence/dashboard';
import { ARROW_ORIGIN } from '@/lib/geo-intelligence/constants';
import type { GeoDashboardSnapshot } from '@/lib/geo-intelligence/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'P2021' || code === 'P2022';
}

function emptySnapshot(reason: string): GeoDashboardSnapshot {
  return {
    summary: {
      activeDealers: 0,
      countriesCovered: 0,
      statesCovered: 0,
      hubspotContactsMapped: 0,
      unmappedContacts: 0,
      dealerRoutes: 0,
    },
    arrowOrigin: ARROW_ORIGIN,
    dealers: [],
    dealerArcs: [],
    ecosystemArcs: [],
    topCities: [],
    countryBuckets: [],
    heatLegend: {
      title: 'Contacts',
      totalContacts: 0,
      maxCount: 0,
      bands: [],
    },
    topCountries: [],
    topStates: [],
    topOwners: [],
    filters: { owners: [], lifecycleStages: [], leadStatuses: [] },
    sync: {
      status: 'uninitialized',
      lastAttemptedAt: null,
      lastSyncedAt: null,
      lastError: reason,
      totalRecords: 0,
      mappableRecords: 0,
      unmappableRecords: 0,
      stale: true,
      hubspotConfigured: false,
    },
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  try {
    const snapshot = await buildGeoDashboardSnapshot({
      ownerId: searchParams.get('ownerId') ?? '',
      lifecycleStage: searchParams.get('lifecycleStage') ?? '',
      leadStatus: searchParams.get('leadStatus') ?? '',
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        emptySnapshot('Geo Intelligence tables are missing. Run `npx prisma migrate deploy` to create them.'),
      );
    }
    throw error;
  }
}
