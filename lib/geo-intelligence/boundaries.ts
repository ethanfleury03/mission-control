import countryIndex from '../../public/data/geo/country-index.json';
import admin1Index from '../../public/data/geo/admin1-index.json';
import { normalizeGeoKey } from './keys';

type CountryProperties = {
  id: string;
  name: string;
  isoA2: string;
  isoA3: string;
  labelLat: number;
  labelLng: number;
  continent: string;
};

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'GBR',
  uae: 'ARE',
  usa: 'USA',
  us: 'USA',
  korea: 'KOR',
  'south korea': 'KOR',
  'north korea': 'PRK',
  russia: 'RUS',
  laos: 'LAO',
  bolivia: 'BOL',
  venezuela: 'VEN',
  tanzania: 'TZA',
  syria: 'SYR',
  iran: 'IRN',
  moldova: 'MDA',
  vietnam: 'VNM',
};

const countries = countryIndex as CountryProperties[];
const admin1Available = new Set(
  (admin1Index as { isoA3: string; count: number }[]).map((entry) => entry.isoA3.toUpperCase()),
);

const countryByIsoA2 = new Map<string, CountryProperties>();
const countryByIsoA3 = new Map<string, CountryProperties>();
const countryByName = new Map<string, CountryProperties>();

for (const country of countries) {
  if (!countryByIsoA2.has(country.isoA2.toUpperCase())) {
    countryByIsoA2.set(country.isoA2.toUpperCase(), country);
  }
  countryByIsoA3.set(country.isoA3.toUpperCase(), country);
  countryByName.set(normalizeGeoKey(country.name), country);
}

for (const [alias, isoA3] of Object.entries(COUNTRY_ALIASES)) {
  const target = countryByIsoA3.get(isoA3);
  if (target) countryByName.set(alias, target);
}

export function resolveCountryRecord(input?: string | null, code?: string | null): CountryProperties | null {
  const rawCode = (code ?? '').trim().toUpperCase();
  if (rawCode.length === 2 && countryByIsoA2.has(rawCode)) return countryByIsoA2.get(rawCode)!;
  if (rawCode.length === 3 && countryByIsoA3.has(rawCode)) return countryByIsoA3.get(rawCode)!;

  const rawInput = (input ?? '').trim();
  if (!rawInput) return null;

  const upper = rawInput.toUpperCase();
  if (upper.length === 2 && countryByIsoA2.has(upper)) return countryByIsoA2.get(upper)!;
  if (upper.length === 3 && countryByIsoA3.has(upper)) return countryByIsoA3.get(upper)!;

  return countryByName.get(normalizeGeoKey(rawInput)) ?? null;
}

export function hasAdmin1Boundary(countryIsoA3: string): boolean {
  return admin1Available.has(countryIsoA3.toUpperCase());
}
