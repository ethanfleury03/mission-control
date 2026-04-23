import { describe, expect, it, vi } from 'vitest';
import { prismaGeoDealerToDomain, prismaGeoSyncToMeta } from '../db-mappers';

describe('geo db mappers', () => {
  it('maps dealer rows into dashboard domain objects with contact counts', () => {
    const dealer = prismaGeoDealerToDomain(
      {
        id: 'dealer-1',
        name: 'Arrow Midwest',
        addressLine1: '123 Industrial Way',
        addressLine2: '',
        city: 'Chicago',
        stateRegion: 'Illinois',
        postalCode: '60601',
        country: 'United States of America',
        countryCode: 'US',
        countryIsoA3: 'USA',
        lat: 41.8781,
        lng: -87.6298,
        status: 'active',
        notes: 'Strong labeling channel partner',
        createdAt: new Date('2026-04-20T12:00:00.000Z'),
        updatedAt: new Date('2026-04-21T12:00:00.000Z'),
      },
      {
        sameCountryContacts: 24,
        sameStateContacts: 12,
        sameCityContacts: 5,
      },
    );

    expect(dealer.sameCountryContacts).toBe(24);
    expect(dealer.sameStateContacts).toBe(12);
    expect(dealer.sameCityContacts).toBe(5);
    expect(dealer.createdAt).toBe('2026-04-20T12:00:00.000Z');
  });

  it('marks HubSpot snapshots stale when the last sync is too old', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T18:00:00.000Z'));

    const syncMeta = prismaGeoSyncToMeta(
      {
        id: 'hubspot_contacts',
        status: 'synced',
        lastAttemptedAt: new Date('2026-04-22T08:00:00.000Z'),
        lastSyncedAt: new Date('2026-04-22T09:00:00.000Z'),
        lastError: '',
        totalRecords: 120,
        mappableRecords: 95,
        unmappableRecords: 25,
        createdAt: new Date('2026-04-21T08:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:00:00.000Z'),
      },
      true,
    );

    expect(syncMeta.stale).toBe(true);
    expect(syncMeta.hubspotConfigured).toBe(true);
    expect(syncMeta.mappableRecords).toBe(95);

    vi.useRealTimers();
  });
});
