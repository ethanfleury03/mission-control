import { prisma } from '@/lib/prisma';
import { hubspotAccessToken } from '@/lib/hubspot/config';
import { hubspotFetch, HubSpotApiError } from '@/lib/hubspot/client';
import { GEO_SYNC_SCOPE_ID } from './constants';
import { buildCountryIdentity, buildStateKey, cleanGeoText } from './normalize';
import { ensureGeoIntelligenceSchema } from './schema';
import type { GeoHubSpotSnapshotRow } from './types';

const SNAPSHOT_BATCH_SIZE = 250;
const SNAPSHOT_TRANSACTION_TIMEOUT_MS = 120_000;

type HubSpotContactRecord = {
  id: string;
  properties?: Record<string, string | null | undefined>;
  updatedAt?: string;
};

type HubSpotContactsPage = {
  results?: HubSpotContactRecord[];
  paging?: {
    next?: {
      after?: string;
    };
  };
};

type HubSpotOwnersPage = {
  results?: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  }>;
};

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function ownerLabel(owner?: { firstName?: string; lastName?: string; email?: string }) {
  const name = `${owner?.firstName ?? ''} ${owner?.lastName ?? ''}`.trim();
  return name || owner?.email || '';
}

function firstResolvedCountry(...candidates: Array<[string, string]>) {
  for (const [countryName, countryCode] of candidates) {
    const country = buildCountryIdentity(countryName, countryCode);
    if (country.countryIsoA3) return country;
  }
  return buildCountryIdentity(candidates[0]?.[0] ?? '', candidates[0]?.[1] ?? '');
}

async function fetchHubSpotOwnersMap() {
  const res = await hubspotFetch('/crm/v3/owners?limit=500', { method: 'GET', retries: 1 });
  if (!res.ok) {
    const body = await res.text();
    throw new HubSpotApiError(`HubSpot owners fetch failed: ${res.status}`, res.status, body);
  }

  const data = (await res.json()) as HubSpotOwnersPage;
  const map = new Map<string, string>();
  for (const owner of data.results ?? []) {
    map.set(owner.id, ownerLabel(owner));
  }
  return map;
}

async function fetchOptionalHubSpotOwnersMap() {
  try {
    return await fetchHubSpotOwnersMap();
  } catch (error) {
    if (error instanceof HubSpotApiError && (error.status === 401 || error.status === 403)) {
      console.warn('HubSpot owners fetch skipped; owner filters will use owner IDs until owner read scope is available.');
      return new Map<string, string>();
    }
    throw error;
  }
}

async function fetchAllHubSpotContacts() {
  const properties = [
    'firstname',
    'lastname',
    'email',
    'arrow_geo_country',
    'arrow_geo_country_code',
    'arrow_geo_state_region',
    'arrow_geo_state_code',
    'arrow_geo_source',
    'country',
    'hs_country_region_code',
    'ip_country',
    'ip_country_code',
    'state',
    'hs_state_code',
    'ip_state',
    'ip_state_code',
    'city',
    'hubspot_owner_id',
    'lifecyclestage',
    'hs_lead_status',
    'hs_persona',
    'lastmodifieddate',
  ];

  const contacts: HubSpotContactRecord[] = [];
  let after: string | undefined;

  do {
    const params = new URLSearchParams({
      limit: '100',
      archived: 'false',
      properties: properties.join(','),
    });
    if (after) params.set('after', after);

    const res = await hubspotFetch(`/crm/v3/objects/contacts?${params.toString()}`, {
      method: 'GET',
      retries: 2,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new HubSpotApiError(`HubSpot contacts fetch failed: ${res.status}`, res.status, body);
    }

    const page = (await res.json()) as HubSpotContactsPage;
    contacts.push(...(page.results ?? []));
    after = page.paging?.next?.after;
  } while (after);

  return contacts;
}

function mapContactToSnapshot(row: HubSpotContactRecord, ownerMap: Map<string, string>, syncedAt: Date): GeoHubSpotSnapshotRow {
  const props = row.properties ?? {};
  const country = firstResolvedCountry(
    [cleanGeoText(props.arrow_geo_country), cleanGeoText(props.arrow_geo_country_code)],
    [cleanGeoText(props.country), cleanGeoText(props.hs_country_region_code)],
    [cleanGeoText(props.ip_country), cleanGeoText(props.ip_country_code)],
  );
  const stateRegion = cleanGeoText(props.arrow_geo_state_region) || cleanGeoText(props.state) || cleanGeoText(props.ip_state);
  const stateCode = (
    cleanGeoText(props.arrow_geo_state_code) ||
    cleanGeoText(props.hs_state_code) ||
    cleanGeoText(props.ip_state_code)
  ).toUpperCase();
  const ownerId = cleanGeoText(props.hubspot_owner_id);

  return {
    hubspotContactId: row.id,
    firstName: cleanGeoText(props.firstname),
    lastName: cleanGeoText(props.lastname),
    email: cleanGeoText(props.email),
    country: country.country,
    countryCode: country.countryCode,
    countryIsoA3: country.countryIsoA3,
    stateRegion,
    stateCode,
    stateKey: buildStateKey(country.countryIsoA3, country.countryCode, stateRegion, stateCode),
    city: cleanGeoText(props.city),
    ownerId,
    ownerName: ownerMap.get(ownerId) ?? '',
    lifecycleStage: cleanGeoText(props.lifecyclestage),
    leadStatus: cleanGeoText(props.hs_lead_status),
    persona: cleanGeoText(props.hs_persona),
    isMappable: Boolean(country.countryIsoA3),
    sourceUpdatedAt: row.updatedAt ? new Date(row.updatedAt) : props.lastmodifieddate ? new Date(String(props.lastmodifieddate)) : null,
    lastSyncedAt: syncedAt,
  };
}

export async function syncHubSpotGeoSnapshots() {
  await ensureGeoIntelligenceSchema();
  if (!hubspotAccessToken()) {
    throw new Error('HUBSPOT_ACCESS_TOKEN is not configured');
  }

  const startedAt = new Date();
  await prisma.geoSyncState.upsert({
    where: { id: GEO_SYNC_SCOPE_ID },
    create: {
      id: GEO_SYNC_SCOPE_ID,
      status: 'syncing',
      lastAttemptedAt: startedAt,
    },
    update: {
      status: 'syncing',
      lastAttemptedAt: startedAt,
      lastError: '',
    },
  });

  try {
    const [ownerMap, contacts] = await Promise.all([fetchOptionalHubSpotOwnersMap(), fetchAllHubSpotContacts()]);
    const syncedAt = new Date();
    const rows = contacts.map((contact) => mapContactToSnapshot(contact, ownerMap, syncedAt));
    const mappableRecords = rows.filter((row) => row.isMappable).length;
    const unmappableRecords = rows.length - mappableRecords;

    await prisma.$transaction(async (tx) => {
      await tx.geoHubSpotContactSnapshot.deleteMany();
      for (const batch of chunk(rows, SNAPSHOT_BATCH_SIZE)) {
        await tx.geoHubSpotContactSnapshot.createMany({
          data: batch,
        });
      }
      await tx.geoSyncState.upsert({
        where: { id: GEO_SYNC_SCOPE_ID },
        create: {
          id: GEO_SYNC_SCOPE_ID,
          status: 'synced',
          lastAttemptedAt: startedAt,
          lastSyncedAt: syncedAt,
          totalRecords: rows.length,
          mappableRecords,
          unmappableRecords,
        },
        update: {
          status: 'synced',
          lastAttemptedAt: startedAt,
          lastSyncedAt: syncedAt,
          lastError: '',
          totalRecords: rows.length,
          mappableRecords,
          unmappableRecords,
        },
      });
    }, {
      maxWait: 10_000,
      timeout: SNAPSHOT_TRANSACTION_TIMEOUT_MS,
    });

    return {
      ok: true,
      totalRecords: rows.length,
      mappableRecords,
      unmappableRecords,
      lastSyncedAt: syncedAt.toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown HubSpot sync failure';
    await prisma.geoSyncState.upsert({
      where: { id: GEO_SYNC_SCOPE_ID },
      create: {
        id: GEO_SYNC_SCOPE_ID,
        status: 'failed',
        lastAttemptedAt: startedAt,
        lastError: message,
      },
      update: {
        status: 'failed',
        lastAttemptedAt: startedAt,
        lastError: message,
      },
    });
    throw error;
  }
}
