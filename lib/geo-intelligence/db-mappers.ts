import type { GeoDealer as PrismaGeoDealer, GeoSyncState as PrismaGeoSyncState } from '@prisma/client';
import { GEO_SYNC_STALE_MS } from './constants';
import type { GeoDealer, GeoSyncMeta } from './types';

export function prismaGeoDealerToDomain(
  dealer: PrismaGeoDealer,
  counts?: { sameCountryContacts?: number; sameStateContacts?: number; sameCityContacts?: number },
): GeoDealer {
  return {
    id: dealer.id,
    name: dealer.name,
    addressLine1: dealer.addressLine1,
    addressLine2: dealer.addressLine2,
    city: dealer.city,
    stateRegion: dealer.stateRegion,
    postalCode: dealer.postalCode,
    country: dealer.country,
    countryCode: dealer.countryCode,
    countryIsoA3: dealer.countryIsoA3,
    lat: dealer.lat,
    lng: dealer.lng,
    status: dealer.status as GeoDealer['status'],
    notes: dealer.notes,
    createdAt: dealer.createdAt.toISOString(),
    updatedAt: dealer.updatedAt.toISOString(),
    sameCountryContacts: counts?.sameCountryContacts ?? 0,
    sameStateContacts: counts?.sameStateContacts ?? 0,
    sameCityContacts: counts?.sameCityContacts ?? 0,
  };
}

export function prismaGeoSyncToMeta(sync: PrismaGeoSyncState | null, hubspotConfigured: boolean): GeoSyncMeta {
  const lastSyncedAt = sync?.lastSyncedAt?.toISOString() ?? null;
  return {
    status: sync?.status ?? 'idle',
    lastAttemptedAt: sync?.lastAttemptedAt?.toISOString() ?? null,
    lastSyncedAt,
    lastError: sync?.lastError ? sync.lastError : null,
    totalRecords: sync?.totalRecords ?? 0,
    mappableRecords: sync?.mappableRecords ?? 0,
    unmappableRecords: sync?.unmappableRecords ?? 0,
    stale: lastSyncedAt ? Date.now() - new Date(lastSyncedAt).getTime() > GEO_SYNC_STALE_MS : true,
    hubspotConfigured,
  };
}
