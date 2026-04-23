import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hubspotAccessToken } from '@/lib/hubspot/config';
import { ARROW_ORIGIN } from './constants';
import { prismaGeoDealerToDomain, prismaGeoSyncToMeta } from './db-mappers';
import { hasAdmin1Boundary, resolveCountryRecord } from './boundaries';
import { buildStateKey } from './normalize';
import { normalizeGeoKey } from './keys';
import type {
  GeoCountryDrilldownSnapshot,
  GeoCoverageBucket,
  GeoDashboardRequest,
  GeoDashboardSnapshot,
  GeoFilterOption,
  GeoFiltersCatalog,
  GeoTopStat,
} from './types';

type SnapshotLite = {
  countryIsoA3: string;
  country: string;
  stateKey: string;
  stateRegion: string;
  stateCode: string;
  city: string;
  ownerId: string;
  ownerName: string;
  lifecycleStage: string;
  leadStatus: string;
  persona: string;
  isMappable: boolean;
};

function normalizeFilter(value: string | undefined) {
  const trimmed = (value ?? '').trim();
  return trimmed && trimmed !== 'all' ? trimmed : undefined;
}

function buildSnapshotWhere(filters: GeoDashboardRequest): Prisma.GeoHubSpotContactSnapshotWhereInput {
  const where: Prisma.GeoHubSpotContactSnapshotWhereInput = {};
  const ownerId = normalizeFilter(filters.ownerId);
  const lifecycleStage = normalizeFilter(filters.lifecycleStage);
  const leadStatus = normalizeFilter(filters.leadStatus);
  const persona = normalizeFilter(filters.persona);

  if (ownerId) where.ownerId = ownerId;
  if (lifecycleStage) where.lifecycleStage = lifecycleStage;
  if (leadStatus) where.leadStatus = leadStatus;
  if (persona) where.persona = persona;

  return where;
}

function buildFilterOptions(values: Array<{ value: string; label: string }>): GeoFilterOption[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const item of values) {
    if (!item.value) continue;
    const entry = counts.get(item.value) ?? { label: item.label || item.value, count: 0 };
    entry.count += 1;
    if (!entry.label && item.label) entry.label = item.label;
    counts.set(item.value, entry);
  }

  return [...counts.entries()]
    .map(([value, entry]) => ({ value, label: entry.label || value, count: entry.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function countBy<T>(items: T[], keyOf: (item: T) => string | null | undefined, labelOf: (item: T) => string) {
  const map = new Map<string, { label: string; count: number }>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const current = map.get(key) ?? { label: labelOf(item), count: 0 };
    current.count += 1;
    map.set(key, current);
  }
  return map;
}

function mapToTopStats(map: Map<string, { label: string; count: number }>, limit = 8): GeoTopStat[] {
  return [...map.entries()]
    .map(([key, value]) => ({ key, label: value.label, count: value.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function cityKey(snapshot: SnapshotLite) {
  const city = normalizeGeoKey(snapshot.city);
  return city ? `${snapshot.countryIsoA3}:${snapshot.stateKey}:${city}` : '';
}

function dealerStateKey(dealer: {
  countryIsoA3: string;
  countryCode: string;
  stateRegion: string;
}) {
  return buildStateKey(dealer.countryIsoA3, dealer.countryCode, dealer.stateRegion, '');
}

function buildDealerCounts(
  rows: SnapshotLite[],
  dealers: Awaited<ReturnType<typeof prisma.geoDealer.findMany>>,
) {
  const countryCounts = countBy(rows.filter((row) => row.isMappable), (row) => row.countryIsoA3, (row) => row.country);
  const stateCounts = countBy(rows.filter((row) => row.isMappable && row.stateKey), (row) => row.stateKey, (row) => row.stateRegion || row.stateCode);
  const cityCounts = countBy(rows.filter((row) => row.isMappable), cityKey, (row) => row.city);

  return dealers.map((dealer) =>
    {
      const stateKey = dealerStateKey(dealer);
      const cityLookupKey = dealer.countryIsoA3 && dealer.city
        ? `${dealer.countryIsoA3}:${stateKey}:${normalizeGeoKey(dealer.city)}`
        : '';

      return prismaGeoDealerToDomain(dealer, {
        sameCountryContacts: countryCounts.get(dealer.countryIsoA3)?.count ?? 0,
        sameStateContacts: stateKey ? stateCounts.get(stateKey)?.count ?? 0 : 0,
        sameCityContacts: cityLookupKey ? cityCounts.get(cityLookupKey)?.count ?? 0 : 0,
      });
    },
  );
}

function buildCountryBuckets(rows: SnapshotLite[]): GeoCoverageBucket[] {
  const map = countBy(
    rows.filter((row) => row.isMappable && row.countryIsoA3),
    (row) => row.countryIsoA3,
    (row) => row.country,
  );

  const buckets = [...map.entries()]
    .map(([key, value]) => {
      const country = resolveCountryRecord(undefined, key);
      if (!country) return null;
      return {
        key,
        label: country.name,
        count: value.count,
        lat: country.labelLat,
        lng: country.labelLng,
        isoA3: country.isoA3,
        code: country.isoA2,
      } satisfies GeoCoverageBucket;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  return buckets.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

async function buildFiltersCatalog(): Promise<GeoFiltersCatalog> {
  const rows = await prisma.geoHubSpotContactSnapshot.findMany({
    select: {
      ownerId: true,
      ownerName: true,
      lifecycleStage: true,
      leadStatus: true,
      persona: true,
    },
  });

  return {
    owners: buildFilterOptions(rows.map((row) => ({ value: row.ownerId, label: row.ownerName || row.ownerId }))),
    lifecycleStages: buildFilterOptions(rows.map((row) => ({ value: row.lifecycleStage, label: row.lifecycleStage }))),
    leadStatuses: buildFilterOptions(rows.map((row) => ({ value: row.leadStatus, label: row.leadStatus }))),
    personas: buildFilterOptions(rows.map((row) => ({ value: row.persona, label: row.persona }))),
  };
}

export async function buildGeoDashboardSnapshot(filters: GeoDashboardRequest): Promise<GeoDashboardSnapshot> {
  const where = buildSnapshotWhere(filters);
  const [rows, dealers, sync, filterCatalog] = await Promise.all([
    prisma.geoHubSpotContactSnapshot.findMany({
      where,
      select: {
        countryIsoA3: true,
        country: true,
        stateKey: true,
        stateRegion: true,
        stateCode: true,
        city: true,
        ownerId: true,
        ownerName: true,
        lifecycleStage: true,
        leadStatus: true,
        persona: true,
        isMappable: true,
      },
    }),
    prisma.geoDealer.findMany({
      where: {
        status: {
          not: 'archived',
        },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    }),
    prisma.geoSyncState.findUnique({ where: { id: 'hubspot_contacts' } }),
    buildFiltersCatalog(),
  ]);

  const mappedRows = rows.filter((row) => row.isMappable && row.countryIsoA3);
  const countryBuckets = buildCountryBuckets(rows);
  const topCountries = mapToTopStats(
    countBy(mappedRows, (row) => row.countryIsoA3, (row) => resolveCountryRecord(undefined, row.countryIsoA3)?.name ?? row.country),
  );
  const topStates = mapToTopStats(
    countBy(mappedRows.filter((row) => row.stateKey), (row) => row.stateKey, (row) => row.stateRegion || row.stateCode || 'Unknown region'),
  );
  const topOwners = mapToTopStats(
    countBy(rows.filter((row) => row.ownerId), (row) => row.ownerId, (row) => row.ownerName || row.ownerId),
  );
  const topPersonas = mapToTopStats(
    countBy(rows.filter((row) => row.persona), (row) => row.persona, (row) => row.persona),
  );
  const dealerDomains = buildDealerCounts(rows, dealers);
  const activeDealers = dealerDomains.filter((dealer) => dealer.status === 'active');

  return {
    summary: {
      activeDealers: activeDealers.length,
      countriesCovered: new Set(countryBuckets.map((bucket) => bucket.isoA3)).size,
      statesCovered: new Set(mappedRows.filter((row) => row.stateKey).map((row) => row.stateKey)).size,
      hubspotContactsMapped: mappedRows.length,
      unmappedContacts: rows.length - mappedRows.length,
    },
    arrowOrigin: ARROW_ORIGIN,
    dealers: dealerDomains,
    dealerArcs: activeDealers.map((dealer) => ({
      id: `dealer-arc:${dealer.id}`,
      startLat: ARROW_ORIGIN.lat,
      startLng: ARROW_ORIGIN.lng,
      endLat: dealer.lat,
      endLng: dealer.lng,
      label: dealer.name,
    })),
    countryBuckets,
    topCountries,
    topStates,
    topOwners,
    topPersonas,
    filters: filterCatalog,
    sync: prismaGeoSyncToMeta(sync, Boolean(hubspotAccessToken())),
  };
}

export async function buildGeoCountryDrilldownSnapshot(
  countryCode: string,
  filters: GeoDashboardRequest,
): Promise<GeoCountryDrilldownSnapshot | null> {
  const country = resolveCountryRecord(countryCode, countryCode);
  if (!country) return null;

  const where = buildSnapshotWhere(filters);
  where.countryIsoA3 = country.isoA3;
  where.isMappable = true;

  const [rows, dealers] = await Promise.all([
    prisma.geoHubSpotContactSnapshot.findMany({
      where,
      select: {
        countryIsoA3: true,
        country: true,
        stateKey: true,
        stateRegion: true,
        stateCode: true,
        city: true,
        ownerId: true,
        ownerName: true,
        lifecycleStage: true,
        leadStatus: true,
        persona: true,
        isMappable: true,
      },
    }),
    prisma.geoDealer.findMany({
      where: {
        status: {
          not: 'archived',
        },
        countryIsoA3: country.isoA3,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const dealerDomains = buildDealerCounts(rows, dealers);
  const stateMap = countBy(
    rows.filter((row) => row.stateKey),
    (row) => row.stateKey,
    (row) => row.stateRegion || row.stateCode || 'Unknown region',
  );
  const stateBuckets = [...stateMap.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      count: value.count,
      code: value.label,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    country: {
      isoA3: country.isoA3,
      isoA2: country.isoA2,
      name: country.name,
      lat: country.labelLat,
      lng: country.labelLng,
    },
    summary: {
      mappedContacts: rows.length,
      statesWithCoverage: stateBuckets.length,
      activeDealers: dealerDomains.filter((dealer) => dealer.status === 'active').length,
    },
    stateBuckets,
    topStates: mapToTopStats(stateMap),
    dealers: dealerDomains,
    cameraTarget: {
      lat: country.labelLat,
      lng: country.labelLng,
      altitude: 1.65,
    },
    availableAdmin1: hasAdmin1Boundary(country.isoA3),
  };
}
