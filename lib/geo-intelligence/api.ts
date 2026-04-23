import type {
  GeoCountryDrilldownSnapshot,
  GeoDashboardSnapshot,
  GeoDealer,
  GeoDealerInput,
  GeoFilterState,
} from './types';

const BASE = '/api/geo-intelligence';

function buildQuery(filters: Partial<GeoFilterState>) {
  const params = new URLSearchParams();
  if (filters.ownerId) params.set('ownerId', filters.ownerId);
  if (filters.lifecycleStage) params.set('lifecycleStage', filters.lifecycleStage);
  if (filters.leadStatus) params.set('leadStatus', filters.leadStatus);
  if (filters.persona) params.set('persona', filters.persona);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function fetchGeoDashboard(filters: Partial<GeoFilterState>): Promise<GeoDashboardSnapshot> {
  const res = await fetch(`${BASE}/dashboard${buildQuery(filters)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchGeoCountryDrilldown(
  countryCode: string,
  filters: Partial<GeoFilterState>,
): Promise<GeoCountryDrilldownSnapshot> {
  const res = await fetch(`${BASE}/country/${encodeURIComponent(countryCode)}${buildQuery(filters)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchGeoDealers(): Promise<GeoDealer[]> {
  const res = await fetch(`${BASE}/dealers`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createGeoDealer(input: GeoDealerInput): Promise<GeoDealer> {
  const res = await fetch(`${BASE}/dealers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as GeoDealer;
}

export async function updateGeoDealer(id: string, input: GeoDealerInput): Promise<GeoDealer> {
  const res = await fetch(`${BASE}/dealers`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...input }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as GeoDealer;
}

export async function deleteGeoDealer(id: string): Promise<void> {
  const res = await fetch(`${BASE}/dealers`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
}

export async function syncGeoHubSpot(): Promise<{
  ok: boolean;
  totalRecords: number;
  mappableRecords: number;
  unmappableRecords: number;
  lastSyncedAt: string;
}> {
  const res = await fetch(`${BASE}/sync-hubspot`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as {
    ok: boolean;
    totalRecords: number;
    mappableRecords: number;
    unmappableRecords: number;
    lastSyncedAt: string;
  };
}
