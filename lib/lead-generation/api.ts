import type { Account, Market } from './types';

const BASE = '/api/lead-generation';

export async function fetchMarkets(): Promise<Market[]> {
  const res = await fetch(`${BASE}/markets`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchMarketBySlug(slug: string): Promise<Market | null> {
  const res = await fetch(`${BASE}/markets/by-slug/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchMarketById(id: string): Promise<Market | null> {
  const res = await fetch(`${BASE}/markets/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchAccounts(params?: Record<string, string>): Promise<Account[]> {
  const q = new URLSearchParams(params ?? {}).toString();
  const res = await fetch(`${BASE}/accounts${q ? `?${q}` : ''}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchAccount(id: string): Promise<Account | null> {
  const res = await fetch(`${BASE}/accounts/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createMarket(body: Partial<Market> & { name: string }): Promise<Market> {
  const res = await fetch(`${BASE}/markets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: body.name,
      slug: body.slug,
      description: body.description ?? '',
      countries: body.countries ?? [],
      targetPersonas: body.targetPersonas ?? [],
      solutionAreas: body.solutionAreas ?? [],
      status: body.status ?? 'active',
      notes: body.notes ?? '',
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export async function updateMarket(marketId: string, patch: Partial<Market>): Promise<Market> {
  const res = await fetch(`${BASE}/markets/${encodeURIComponent(marketId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export async function deleteMarket(marketId: string): Promise<void> {
  const res = await fetch(`${BASE}/markets/${encodeURIComponent(marketId)}`, { method: 'DELETE' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error ?? res.statusText);
  }
}

export async function fetchHubSpotConfig(): Promise<{
  pushDisabled: boolean;
  portalConfigured: boolean;
  portalId: string | null;
}> {
  const res = await fetch(`${BASE}/hubspot-config`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function pushAccountToHubSpot(accountId: string): Promise<{ hubspotContactId: string; account: Account }> {
  const res = await fetch(`${BASE}/accounts/${encodeURIComponent(accountId)}/push-to-hubspot`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return {
    hubspotContactId: (data as { hubspotContactId: string }).hubspotContactId,
    account: (data as { account: Account }).account,
  };
}

export async function bulkPushAccountsToHubSpot(accountIds: string[]): Promise<{
  pushed: number;
  failed: number;
  results: { id: string; ok: boolean; error?: string; hubspotContactId?: string }[];
}> {
  const res = await fetch(`${BASE}/accounts/bulk-push-hubspot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountIds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as {
    pushed: number;
    failed: number;
    results: { id: string; ok: boolean; error?: string; hubspotContactId?: string }[];
  };
}

export async function importCsvToMarket(marketId: string, file: File): Promise<{
  created: number;
  skipped: number;
  errors: string[];
  truncated?: boolean;
}> {
  const form = new FormData();
  form.set('marketId', marketId);
  form.set('file', file);
  const res = await fetch(`${BASE}/accounts/import-csv`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as { created: number; skipped: number; errors: string[]; truncated?: boolean };
}

export async function updateAccount(accountId: string, patch: Partial<Account>): Promise<Account> {
  const res = await fetch(`${BASE}/accounts/${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export async function importScraperToMarket(body: {
  jobId: string;
  marketId: string;
  resultIds?: string[];
  defaultCountry?: string;
  skipDuplicates?: boolean;
}): Promise<{ created: number; updated?: number; skipped: number; errors: string[] }> {
  const res = await fetch(`${BASE}/accounts/import-from-scraper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as { created: number; updated?: number; skipped: number; errors: string[] };
}
