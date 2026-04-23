import { describe, expect, it } from 'vitest';
import { buildFeatureStateKeys, normalizeGeoKey } from '../keys';
import {
  buildCountryIdentity,
  buildStateKey,
  normalizeGeoDealerInput,
  normalizeGeoText,
} from '../normalize';

describe('geo normalization helpers', () => {
  it('normalizes geo text consistently', () => {
    expect(normalizeGeoText('  Qu\xe9bec  ')).toBe('quebec');
    expect(normalizeGeoKey('New-York / Metro')).toBe('new york metro');
  });

  it('builds canonical country identities from aliases and codes', () => {
    expect(buildCountryIdentity('United States', 'us')).toEqual(
      expect.objectContaining({
        countryCode: 'US',
        countryIsoA3: 'USA',
      }),
    );

    expect(buildCountryIdentity('South Korea', '')).toEqual(
      expect.objectContaining({
        countryCode: 'KR',
        countryIsoA3: 'KOR',
      }),
    );
  });

  it('builds state keys from state code or normalized region name', () => {
    expect(buildStateKey('USA', 'US', 'Washington', 'WA')).toBe('US-WA');
    expect(buildStateKey('CAN', 'CA', 'British Columbia', '')).toBe('name:CAN:british columbia');
    expect(buildStateKey('', '', '', '')).toBe('');
  });

  it('normalizes dealer input using canonical country identity', () => {
    expect(
      normalizeGeoDealerInput({
        country: 'usa',
        lat: 43.3255,
        lng: -79.799,
      }),
    ).toEqual(
      expect.objectContaining({
        countryCode: 'US',
        countryIsoA3: 'USA',
        lat: 43.3255,
        lng: -79.799,
      }),
    );
  });

  it('builds multiple state lookup keys for admin1 features', () => {
    expect(
      buildFeatureStateKeys({
        iso31662: 'US-WA',
        name: 'Washington',
        nameAlt: 'WA|Wash.',
        adm0A3: 'USA',
      }),
    ).toEqual(
      expect.arrayContaining([
        'US-WA',
        'name:USA:washington',
        'name:USA:wa wash',
      ]),
    );
  });
});
