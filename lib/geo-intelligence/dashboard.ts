import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hubspotAccessToken } from '@/lib/hubspot/config';
import { ARROW_ORIGIN } from './constants';
import { prismaGeoDealerToDomain, prismaGeoSyncToMeta } from './db-mappers';
import { hasAdmin1Boundary, resolveCountryRecord } from './boundaries';
import { buildStateKey } from './normalize';
import { normalizeGeoKey } from './keys';
import type {
  GeoArc,
  GeoCityPoint,
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
  const topCities = buildTopCityPoints(mappedRows, 18);
  const dealerArcs: GeoArc[] = activeDealers.map((dealer) => ({
    id: `dealer-arc:${dealer.id}`,
    startLat: ARROW_ORIGIN.lat,
    startLng: ARROW_ORIGIN.lng,
    endLat: dealer.lat,
    endLng: dealer.lng,
    label: dealer.name,
    kind: 'dealer',
  }));
  const ecosystemArcs = buildEcosystemArcs(topCities, 40);

  return {
    summary: {
      activeDealers: activeDealers.length,
      countriesCovered: new Set(countryBuckets.map((bucket) => bucket.isoA3)).size,
      statesCovered: new Set(mappedRows.filter((row) => row.stateKey).map((row) => row.stateKey)).size,
      hubspotContactsMapped: mappedRows.length,
      unmappedContacts: rows.length - mappedRows.length,
      dealerRoutes: dealerArcs.length,
    },
    arrowOrigin: ARROW_ORIGIN,
    dealers: dealerDomains,
    dealerArcs,
    ecosystemArcs,
    topCities,
    countryBuckets,
    topCountries,
    topStates,
    topOwners,
    topPersonas,
    filters: filterCatalog,
    sync: prismaGeoSyncToMeta(sync, Boolean(hubspotAccessToken())),
  };
}

function buildTopCityPoints(rows: SnapshotLite[], limit: number): GeoCityPoint[] {
  const map = new Map<string, { label: string; country: string; countryIsoA3: string; count: number }>();
  for (const row of rows) {
    if (!row.city || !row.countryIsoA3) continue;
    const cityNorm = normalizeGeoKey(row.city);
    if (!cityNorm) continue;
    const key = `${row.countryIsoA3}:${cityNorm}`;
    const existing = map.get(key) ?? {
      label: row.city,
      country: row.country,
      countryIsoA3: row.countryIsoA3,
      count: 0,
    };
    existing.count += 1;
    map.set(key, existing);
  }

  const sorted = [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit);

  const results: GeoCityPoint[] = [];
  for (const [key, value] of sorted) {
    const coords = resolveCityCoordinates(value.label, value.countryIsoA3);
    if (!coords) continue;
    results.push({
      key,
      label: value.label,
      country: value.country,
      countryIsoA3: value.countryIsoA3,
      lat: coords.lat,
      lng: coords.lng,
      count: value.count,
    });
  }
  return results;
}

function buildEcosystemArcs(cities: GeoCityPoint[], limit: number): GeoArc[] {
  if (cities.length < 2) return [];
  const anchors = cities.slice(0, Math.min(cities.length, 8));
  const rest = cities.slice(0, Math.min(cities.length, 20));
  const arcs: GeoArc[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < anchors.length; i += 1) {
    for (let j = 0; j < rest.length; j += 1) {
      if (arcs.length >= limit) break;
      const a = anchors[i];
      const b = rest[j];
      if (a.key === b.key) continue;
      const id = a.key < b.key ? `${a.key}__${b.key}` : `${b.key}__${a.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      arcs.push({
        id: `eco-arc:${id}`,
        startLat: a.lat,
        startLng: a.lng,
        endLat: b.lat,
        endLng: b.lng,
        label: `${a.label} → ${b.label}`,
        kind: 'ecosystem',
        weight: Math.min(a.count, b.count),
      });
    }
    if (arcs.length >= limit) break;
  }
  return arcs;
}

function resolveCityCoordinates(city: string, countryIsoA3: string) {
  const key = `${countryIsoA3.toUpperCase()}:${normalizeGeoKey(city)}`;
  const direct = CITY_COORDINATES[key];
  if (direct) return direct;
  const country = resolveCountryRecord(undefined, countryIsoA3);
  if (!country) return null;
  // Light jitter keyed to city name so markers don't all stack on the country centroid.
  const hash = hashString(key);
  const jitterLat = ((hash % 1000) / 1000 - 0.5) * 2.4;
  const jitterLng = (((hash >> 10) % 1000) / 1000 - 0.5) * 2.4;
  return {
    lat: country.labelLat + jitterLat,
    lng: country.labelLng + jitterLng,
  };
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'USA:newyork': { lat: 40.7128, lng: -74.006 },
  'USA:losangeles': { lat: 34.0522, lng: -118.2437 },
  'USA:chicago': { lat: 41.8781, lng: -87.6298 },
  'USA:houston': { lat: 29.7604, lng: -95.3698 },
  'USA:phoenix': { lat: 33.4484, lng: -112.074 },
  'USA:philadelphia': { lat: 39.9526, lng: -75.1652 },
  'USA:sanfrancisco': { lat: 37.7749, lng: -122.4194 },
  'USA:sandiego': { lat: 32.7157, lng: -117.1611 },
  'USA:seattle': { lat: 47.6062, lng: -122.3321 },
  'USA:denver': { lat: 39.7392, lng: -104.9903 },
  'USA:boston': { lat: 42.3601, lng: -71.0589 },
  'USA:miami': { lat: 25.7617, lng: -80.1918 },
  'USA:atlanta': { lat: 33.749, lng: -84.388 },
  'USA:dallas': { lat: 32.7767, lng: -96.797 },
  'USA:austin': { lat: 30.2672, lng: -97.7431 },
  'USA:saltlakecity': { lat: 40.7608, lng: -111.891 },
  'USA:minneapolis': { lat: 44.9778, lng: -93.265 },
  'USA:detroit': { lat: 42.3314, lng: -83.0458 },
  'USA:honolulu': { lat: 21.3069, lng: -157.8583 },
  'USA:portland': { lat: 45.5152, lng: -122.6784 },
  'CAN:toronto': { lat: 43.6532, lng: -79.3832 },
  'CAN:vancouver': { lat: 49.2827, lng: -123.1207 },
  'CAN:montreal': { lat: 45.5017, lng: -73.5673 },
  'CAN:calgary': { lat: 51.0447, lng: -114.0719 },
  'CAN:edmonton': { lat: 53.5461, lng: -113.4938 },
  'CAN:ottawa': { lat: 45.4215, lng: -75.6972 },
  'CAN:burlington': { lat: 43.3255, lng: -79.799 },
  'GBR:london': { lat: 51.5074, lng: -0.1278 },
  'GBR:manchester': { lat: 53.4808, lng: -2.2426 },
  'GBR:birmingham': { lat: 52.4862, lng: -1.8904 },
  'FRA:paris': { lat: 48.8566, lng: 2.3522 },
  'DEU:berlin': { lat: 52.52, lng: 13.405 },
  'DEU:munich': { lat: 48.1351, lng: 11.582 },
  'DEU:hamburg': { lat: 53.5511, lng: 9.9937 },
  'DEU:frankfurt': { lat: 50.1109, lng: 8.6821 },
  'ESP:madrid': { lat: 40.4168, lng: -3.7038 },
  'ESP:barcelona': { lat: 41.3851, lng: 2.1734 },
  'ITA:rome': { lat: 41.9028, lng: 12.4964 },
  'ITA:milan': { lat: 45.4642, lng: 9.19 },
  'NLD:amsterdam': { lat: 52.3676, lng: 4.9041 },
  'CHE:zurich': { lat: 47.3769, lng: 8.5417 },
  'SWE:stockholm': { lat: 59.3293, lng: 18.0686 },
  'NOR:oslo': { lat: 59.9139, lng: 10.7522 },
  'DNK:copenhagen': { lat: 55.6761, lng: 12.5683 },
  'FIN:helsinki': { lat: 60.1699, lng: 24.9384 },
  'POL:warsaw': { lat: 52.2297, lng: 21.0122 },
  'RUS:moscow': { lat: 55.7558, lng: 37.6173 },
  'RUS:saintpetersburg': { lat: 59.9343, lng: 30.3351 },
  'TUR:istanbul': { lat: 41.0082, lng: 28.9784 },
  'ARE:dubai': { lat: 25.2048, lng: 55.2708 },
  'ARE:abudhabi': { lat: 24.4539, lng: 54.3773 },
  'SAU:riyadh': { lat: 24.7136, lng: 46.6753 },
  'IND:mumbai': { lat: 19.076, lng: 72.8777 },
  'IND:delhi': { lat: 28.6139, lng: 77.209 },
  'IND:newdelhi': { lat: 28.6139, lng: 77.209 },
  'IND:bangalore': { lat: 12.9716, lng: 77.5946 },
  'IND:bengaluru': { lat: 12.9716, lng: 77.5946 },
  'IND:hyderabad': { lat: 17.385, lng: 78.4867 },
  'IND:chennai': { lat: 13.0827, lng: 80.2707 },
  'IND:kolkata': { lat: 22.5726, lng: 88.3639 },
  'IND:pune': { lat: 18.5204, lng: 73.8567 },
  'IND:ahmedabad': { lat: 23.0225, lng: 72.5714 },
  'PAK:karachi': { lat: 24.8607, lng: 67.0011 },
  'PAK:lahore': { lat: 31.5204, lng: 74.3587 },
  'BGD:dhaka': { lat: 23.8103, lng: 90.4125 },
  'NPL:kathmandu': { lat: 27.7172, lng: 85.324 },
  'CHN:beijing': { lat: 39.9042, lng: 116.4074 },
  'CHN:shanghai': { lat: 31.2304, lng: 121.4737 },
  'CHN:guangzhou': { lat: 23.1291, lng: 113.2644 },
  'CHN:shenzhen': { lat: 22.5431, lng: 114.0579 },
  'HKG:hongkong': { lat: 22.3193, lng: 114.1694 },
  'TWN:taipei': { lat: 25.033, lng: 121.5654 },
  'JPN:tokyo': { lat: 35.6762, lng: 139.6503 },
  'JPN:osaka': { lat: 34.6937, lng: 135.5023 },
  'KOR:seoul': { lat: 37.5665, lng: 126.978 },
  'SGP:singapore': { lat: 1.3521, lng: 103.8198 },
  'MYS:kualalumpur': { lat: 3.139, lng: 101.6869 },
  'THA:bangkok': { lat: 13.7563, lng: 100.5018 },
  'VNM:hanoi': { lat: 21.0285, lng: 105.8542 },
  'VNM:hochiminhcity': { lat: 10.7769, lng: 106.7009 },
  'IDN:jakarta': { lat: -6.2088, lng: 106.8456 },
  'PHL:manila': { lat: 14.5995, lng: 120.9842 },
  'KHM:phnompenh': { lat: 11.5564, lng: 104.9282 },
  'MNG:ulaanbaatar': { lat: 47.8864, lng: 106.9057 },
  'AUS:sydney': { lat: -33.8688, lng: 151.2093 },
  'AUS:melbourne': { lat: -37.8136, lng: 144.9631 },
  'AUS:brisbane': { lat: -27.4698, lng: 153.0251 },
  'AUS:perth': { lat: -31.9505, lng: 115.8605 },
  'NZL:auckland': { lat: -36.8485, lng: 174.7633 },
  'NZL:wellington': { lat: -41.2865, lng: 174.7762 },
  'BRA:saopaulo': { lat: -23.5505, lng: -46.6333 },
  'BRA:riodejaneiro': { lat: -22.9068, lng: -43.1729 },
  'ARG:buenosaires': { lat: -34.6037, lng: -58.3816 },
  'CHL:santiago': { lat: -33.4489, lng: -70.6693 },
  'COL:bogota': { lat: 4.711, lng: -74.0721 },
  'MEX:mexicocity': { lat: 19.4326, lng: -99.1332 },
  'PER:lima': { lat: -12.0464, lng: -77.0428 },
  'EGY:cairo': { lat: 30.0444, lng: 31.2357 },
  'ZAF:johannesburg': { lat: -26.2041, lng: 28.0473 },
  'ZAF:capetown': { lat: -33.9249, lng: 18.4241 },
  'NGA:lagos': { lat: 6.5244, lng: 3.3792 },
  'KEN:nairobi': { lat: -1.2921, lng: 36.8219 },
};

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
