import { resolveCountryRecord } from './boundaries';
import { normalizeGeoKey } from './keys';

export function cleanGeoText(input?: string | null) {
  return (input ?? '').trim();
}

export function normalizeGeoText(input?: string | null) {
  return normalizeGeoKey(cleanGeoText(input));
}

export function buildCountryIdentity(inputCountry?: string | null, inputCode?: string | null) {
  const record = resolveCountryRecord(inputCountry, inputCode);
  if (!record) {
    return {
      country: cleanGeoText(inputCountry),
      countryCode: cleanGeoText(inputCode).toUpperCase(),
      countryIsoA3: '',
    };
  }

  return {
    country: record.name,
    countryCode: record.isoA2,
    countryIsoA3: record.isoA3,
  };
}

export function buildStateKey(countryIsoA3: string, countryCode: string, stateRegion?: string | null, stateCode?: string | null) {
  const rawCode = cleanGeoText(stateCode).toUpperCase();
  if (rawCode) {
    if (rawCode.includes('-')) return rawCode;
    if (countryCode) return `${countryCode.toUpperCase()}-${rawCode}`;
    return `${countryIsoA3.toUpperCase()}:${rawCode}`;
  }

  const rawState = cleanGeoText(stateRegion);
  if (!rawState || !countryIsoA3) return '';
  return `name:${countryIsoA3.toUpperCase()}:${normalizeGeoText(rawState)}`;
}

export function normalizeGeoDealerInput(input: {
  country?: string | null;
  lat?: number;
  lng?: number;
}) {
  const country = buildCountryIdentity(input.country);
  return {
    ...country,
    lat: Number(input.lat),
    lng: Number(input.lng),
  };
}
