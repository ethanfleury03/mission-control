import { prisma } from '@/lib/prisma';
import { hubspotAccessToken } from '@/lib/hubspot/config';
import { hubspotFetch, HubSpotApiError } from '@/lib/hubspot/client';
import { GEO_SYNC_SCOPE_ID } from './constants';
import { buildCountryIdentity, buildStateKey, cleanGeoText } from './normalize';
import type { GeoHubSpotSnapshotRow } from './types';

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

async function fetchAllHubSpotContacts() {
  const properties = [
    'firstname',
    'lastname',
    'email',
    'country',
    'hs_country_region_code',
    'state',
    'hs_state_code',
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
  const rawCountry = cleanGeoText(props.country);
  const rawCountryCode = cleanGeoText(props.hs_country_region_code);
  const country = buildCountryIdentity(rawCountry, rawCountryCode);
  const stateRegion = cleanGeoText(props.state);
  const stateCode = cleanGeoText(props.hs_state_code).toUpperCase();
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
    const [ownerMap, contacts] = await Promise.all([fetchHubSpotOwnersMap(), fetchAllHubSpotContacts()]);
    const syncedAt = new Date();
    const rows = contacts.map((contact) => mapContactToSnapshot(contact, ownerMap, syncedAt));
    const mappableRecords = rows.filter((row) => row.isMappable).length;
    const unmappableRecords = rows.length - mappableRecords;

    await prisma.$transaction(async (tx) => {
      await tx.geoHubSpotContactSnapshot.deleteMany();
      for (const batch of chunk(rows, 500)) {
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
